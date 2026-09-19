use anyhow::{Result, anyhow, bail};
use keyring::{Entry, Error};
use pico_store_lab::PicoAuth;
use serde::{Deserialize, Serialize};

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
compile_error!("The desktop app requires macOS, Windows, or Linux");

#[derive(Clone, Serialize, Deserialize)]
pub struct Account {
    pub email: String,
    pub auth: PicoAuth,
}

fn entry() -> Result<Entry> {
    Entry::new("dev.nkanf.picostore.desktop", "current")
        .map_err(|_| anyhow!("Unable to open the system credential store."))
}

pub fn save(account: &Account) -> Result<()> {
    if account.auth.x_tt_token.is_empty() && account.auth.cookies.is_empty() {
        bail!("Sign-in returned no usable session.");
    }
    let value = serde_json::to_string(account)?;
    entry()?.set_password(&value).map_err(|_| {
        anyhow!("Unable to save sign-in. Unlock the system credential store and try again.")
    })
}

pub fn load() -> Result<Option<Account>> {
    let value = match entry()?.get_password() {
        Ok(value) => value,
        Err(Error::NoEntry) => return Ok(None),
        Err(_) => {
            bail!("Unable to read sign-in. Unlock the system credential store and try again.")
        }
    };
    let account: Account = serde_json::from_str(&value)
        .map_err(|_| anyhow!("Sign-in could not be read. Please sign in again."))?;
    if account.auth.x_tt_token.is_empty() && account.auth.cookies.is_empty() {
        bail!("Please sign in again.");
    }
    Ok(Some(account))
}

pub fn clear() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(_) => Err(anyhow!(
            "Could not sign out. Unlock the system credential store and try again."
        )),
    }
}
