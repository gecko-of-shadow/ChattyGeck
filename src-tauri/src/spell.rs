//! Windows' built-in spell checker (the Spell Checking API), owned by one background thread.
//!
//! ZooChattr asks it only two things: is this word spelled right (Check), and what could it be
//! instead (Suggest). It never adds, ignores, removes or autocorrects words, so the Windows
//! dictionaries under %AppData%\Microsoft\Spelling stay exactly as they were. Everything runs on
//! this PC; the API has no online part.

use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use windows::Win32::Globalization::{ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory};
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
};
use windows::core::{HSTRING, PWSTR};

/// A check waits this long for the spell thread before giving up (the page then underlines nothing).
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);
/// Suggestions returned per word.
const MAX_SUGGESTIONS: usize = 8;
/// One request covers one chat line (at most 500 characters), so these are generous.
const MAX_WORDS: usize = 500;
const MAX_WORD_CHARS: usize = 100;

enum Job {
    Check {
        language: String,
        words: Vec<String>,
        reply: Sender<Result<Vec<bool>, String>>,
    },
    Suggest {
        language: String,
        word: String,
        reply: Sender<Result<Vec<String>, String>>,
    },
}

/// Handle to the spell thread. Clones share the same thread.
#[derive(Clone)]
pub struct WindowsSpell {
    jobs: Sender<Job>,
}

impl WindowsSpell {
    /// Starts the thread. Windows' checker is created on first use, so app startup pays nothing.
    pub fn start() -> Self {
        let (jobs, inbox) = mpsc::channel();
        // If the thread can't start, every call reports an error and the page uses its own checker.
        let _ = thread::Builder::new()
            .name("spell-check".into())
            .spawn(move || serve(inbox));
        Self { jobs }
    }

    /// For each word, whether Windows spells it that way.
    pub fn check(&self, language: &str, words: Vec<String>) -> Result<Vec<bool>, String> {
        if words.len() > MAX_WORDS {
            return Err("Too many words to check at once".into());
        }
        let (reply, answer) = mpsc::channel();
        self.send(Job::Check {
            language: language.into(),
            words,
            reply,
        })?;
        wait(answer)
    }

    /// Windows' suggestions for one word, best first.
    pub fn suggest(&self, language: &str, word: String) -> Result<Vec<String>, String> {
        let (reply, answer) = mpsc::channel();
        self.send(Job::Suggest {
            language: language.into(),
            word,
            reply,
        })?;
        wait(answer)
    }

    fn send(&self, job: Job) -> Result<(), String> {
        self.jobs
            .send(job)
            .map_err(|_| "The spell checker stopped".to_string())
    }
}

fn wait<T>(answer: Receiver<Result<T, String>>) -> Result<T, String> {
    answer
        .recv_timeout(REPLY_TIMEOUT)
        .map_err(|_| "The spell checker did not answer".to_string())?
}

fn serve(inbox: Receiver<Job>) {
    // COM objects belong to the thread that made them; this thread makes and uses all of them.
    if unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_err() {
        for job in inbox {
            refuse(job, "Windows spell checking is not available");
        }
        return;
    }
    let mut spell = Checkers::default();
    for job in inbox {
        match job {
            Job::Check {
                language,
                words,
                reply,
            } => {
                let _ = reply.send(spell.get(&language).and_then(|checker| check_words(checker, &words)));
            }
            Job::Suggest {
                language,
                word,
                reply,
            } => {
                let _ = reply.send(spell.get(&language).and_then(|checker| suggest_word(checker, &word)));
            }
        }
    }
    // Release the COM objects before leaving COM.
    drop(spell);
    unsafe { CoUninitialize() };
}

fn refuse(job: Job, reason: &str) {
    match job {
        Job::Check { reply, .. } => {
            let _ = reply.send(Err(reason.into()));
        }
        Job::Suggest { reply, .. } => {
            let _ = reply.send(Err(reason.into()));
        }
    }
}

/// One Windows checker per language tag, made the first time that language is asked for.
#[derive(Default)]
struct Checkers {
    factory: Option<ISpellCheckerFactory>,
    by_language: HashMap<String, ISpellChecker>,
}

impl Checkers {
    fn get(&mut self, language: &str) -> Result<&ISpellChecker, String> {
        if !self.by_language.contains_key(language) {
            let checker = self.create(language)?;
            self.by_language.insert(language.to_string(), checker);
        }
        self.by_language
            .get(language)
            .ok_or_else(|| "The spell checker is missing".to_string())
    }

    fn create(&mut self, language: &str) -> Result<ISpellChecker, String> {
        if self.factory.is_none() {
            let factory: ISpellCheckerFactory = unsafe { CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_ALL) }
                .map_err(|err| format!("Windows spell checking is not available: {err}"))?;
            self.factory = Some(factory);
        }
        let Some(factory) = &self.factory else {
            return Err("Windows spell checking is not available".into());
        };
        let tag = HSTRING::from(language);
        let supported = unsafe { factory.IsSupported(&tag) }.map_err(|err| err.to_string())?;
        if !supported.as_bool() {
            return Err(format!("Windows has no {language} spell checker installed"));
        }
        unsafe { factory.CreateSpellChecker(&tag) }.map_err(|err| err.to_string())
    }
}

fn check_words(checker: &ISpellChecker, words: &[String]) -> Result<Vec<bool>, String> {
    words.iter().map(|word| is_correct(checker, word)).collect()
}

fn is_correct(checker: &ISpellChecker, word: &str) -> Result<bool, String> {
    if word.trim().is_empty() || word.chars().count() > MAX_WORD_CHARS {
        return Ok(true);
    }
    let errors = unsafe { checker.Check(&HSTRING::from(word)) }.map_err(|err| err.to_string())?;
    let mut first = None;
    // S_OK hands back the first problem; S_FALSE means there are none.
    unsafe { errors.Next(&mut first) }
        .ok()
        .map_err(|err| err.to_string())?;
    Ok(first.is_none())
}

fn suggest_word(checker: &ISpellChecker, word: &str) -> Result<Vec<String>, String> {
    if word.trim().is_empty() || word.chars().count() > MAX_WORD_CHARS {
        return Ok(Vec::new());
    }
    let list = unsafe { checker.Suggest(&HSTRING::from(word)) }.map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    while out.len() < MAX_SUGGESTIONS {
        let mut item = [PWSTR::null()];
        let mut fetched = 0u32;
        let status = unsafe { list.Next(&mut item, Some(&mut fetched as *mut u32)) };
        if status.is_err() || fetched == 0 || item[0].is_null() {
            break;
        }
        let text = unsafe { item[0].to_string() }.unwrap_or_default();
        // Strings from the enumerator are ours to free.
        unsafe { CoTaskMemFree(Some(item[0].as_ptr() as *const std::ffi::c_void)) };
        if !text.is_empty() {
            out.push(text);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::WindowsSpell;

    #[test]
    fn checks_and_suggests_with_the_windows_dictionary() {
        let spell = WindowsSpell::start();
        let words = vec!["hello".to_string(), "recieve".to_string(), "don't".to_string()];
        let Ok(results) = spell.check("en-US", words) else {
            eprintln!("this PC has no en-US spell checker; skipped");
            return;
        };
        assert_eq!(results, vec![true, false, true]);
        let suggestions = spell.suggest("en-US", "recieve".to_string()).expect("suggestions");
        assert_eq!(suggestions.first().map(String::as_str), Some("receive"));
        assert!(spell.suggest("en-US", String::new()).expect("empty word").is_empty());
    }

    #[test]
    fn a_language_windows_lacks_is_an_error_not_a_crash() {
        let spell = WindowsSpell::start();
        assert!(spell.check("xx-XX", vec!["hello".to_string()]).is_err());
    }

    #[test]
    fn never_touches_the_windows_dictionaries() {
        // Tripwire for the promise at the top of this file: only Check and Suggest are ever called.
        let source = include_str!("spell.rs");
        for method in ["Add", "AutoCorrect", "Ignore", "Remove"] {
            let call = format!(".{method}(");
            assert!(!source.contains(&call), "spell.rs must not call ISpellChecker::{method}");
        }
    }
}
