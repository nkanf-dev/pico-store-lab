//! Typed PICO store protocol and mirror policy primitives.

mod client;
pub use client::{HttpTransport, PicoStoreClient, StoreResponse, Transport, download_verified_apk};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

pub const PICO_ITEM_ID: &str = "7288745304105664518";
pub const PICO_PACKAGE: &str = "com.vrchat.android";
pub const STORE_HOST: &str = "https://appstore-us.picoxr.com";
pub const ACCOUNT_HOST: &str = "https://matrix-us.picovr.com";
pub const OFFICIAL_STORE_URL: &str =
    "https://store-global.picoxr.com/jp/detail/1/7288745304105664518";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoreConfig {
    pub store_host: String,
    pub account_host: String,
    pub web_store_host: String,
    pub web_region: String,
    pub manifest_version_code: String,
    pub device_name: String,
    pub app_id: String,
    pub client_type: String,
    pub language: String,
    pub zone: String,
    pub passport_aid: String,
    pub device_platform: String,
}

impl Default for StoreConfig {
    fn default() -> Self {
        Self {
            store_host: STORE_HOST.into(),
            account_host: ACCOUNT_HOST.into(),
            web_store_host: "https://store-global.picoxr.com".into(),
            web_region: "global".into(),
            manifest_version_code: "401200000".into(),
            device_name: "A9210".into(),
            app_id: "314431".into(),
            client_type: "1".into(),
            language: "ja".into(),
            zone: "Asia/Shanghai".into(),
            passport_aid: "308733".into(),
            device_platform: "android".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoreTarget {
    pub item_id: String,
    pub package_name: String,
    pub name: String,
}

impl StoreTarget {
    pub fn new(item_id: &str, package_name: &str, name: &str) -> Result<Self, SdkError> {
        if item_id.is_empty()
            || item_id.len() > 20
            || !item_id.bytes().all(|b| b.is_ascii_digit())
            || !package_name.contains('.')
            || !package_name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_')
        {
            return Err(SdkError(
                "valid PICO item ID and package name required".into(),
            ));
        }
        Ok(Self {
            item_id: item_id.into(),
            package_name: package_name.into(),
            name: name.into(),
        })
    }
}

impl Default for StoreTarget {
    fn default() -> Self {
        Self::new(PICO_ITEM_ID, PICO_PACKAGE, "VRChat").expect("valid default target")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SdkError(pub String);

impl fmt::Display for SdkError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl std::error::Error for SdkError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestSpec {
    pub url: String,
    pub method: &'static str,
    pub headers: BTreeMap<String, String>,
    pub body: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PicoAuth {
    pub uid: String,
    pub x_tt_token: String,
    pub cookies: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PublicItem {
    pub item_id: String,
    pub package_name: String,
    pub name: String,
    pub version_code: u64,
    pub price: String,
    pub currency: String,
    pub icon_url: Option<String>,
    pub summary: String,
    pub description: String,
    pub publisher: String,
    pub genres: String,
    pub app_version: String,
    pub official_url: String,
    pub entitlement_status: Option<i64>,
    pub offer_exists: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DownloadInfo {
    pub item_id: String,
    pub package_name: String,
    pub version_code: u64,
    pub version: String,
    pub size: u64,
    pub md5: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SearchItem {
    pub item_id: String,
    pub package_name: String,
    pub name: String,
    pub version_code: Option<u64>,
    pub price: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SearchResults {
    pub items: Vec<SearchItem>,
    pub next_id: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MirrorPolicy {
    pub enabled: bool,
    pub free_only: bool,
    pub max_bytes: u64,
}

impl Default for MirrorPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            free_only: true,
            max_bytes: 512 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MirrorReason {
    Eligible,
    Disabled,
    NotFree,
    OverSizeLimit,
}

pub fn mirror_decision(
    price: &str,
    size: u64,
    policy: &MirrorPolicy,
) -> Result<MirrorReason, SdkError> {
    if size == 0 {
        return Err(SdkError("invalid APK size".into()));
    }
    if !policy.enabled {
        return Ok(MirrorReason::Disabled);
    }
    if policy.free_only
        && !(price == "0"
            || price.starts_with("0.") && price[2..].chars().all(|c| c == '0') && price.len() > 2)
    {
        return Ok(MirrorReason::NotFree);
    }
    if size > policy.max_bytes {
        return Ok(MirrorReason::OverSizeLimit);
    }
    Ok(MirrorReason::Eligible)
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before Unix epoch")
        .as_secs()
}

fn store_url(path: &str, uid: &str, timestamp: u64, config: &StoreConfig) -> String {
    let mut url = Url::parse(&config.store_host).expect("valid store URL");
    url.set_path(path);
    url.query_pairs_mut()
        .append_pair("manifest_version_code", &config.manifest_version_code)
        .append_pair("device_name", &config.device_name)
        .append_pair("uid", uid)
        .append_pair("app_id", &config.app_id)
        .append_pair("app_language", &config.language)
        .append_pair("client_type", &config.client_type)
        .append_pair("zone_name", &config.zone)
        .append_pair("timestamp", &timestamp.to_string());
    url.into()
}

pub fn make_public_item_request() -> RequestSpec {
    make_public_item_request_at(current_timestamp())
}

pub fn make_public_item_request_for_now(target: &StoreTarget) -> RequestSpec {
    make_public_item_request_for(target, current_timestamp())
}

pub fn make_public_item_request_at(timestamp: u64) -> RequestSpec {
    make_public_item_request_for(&StoreTarget::default(), timestamp)
}

pub fn make_public_item_request_for(target: &StoreTarget, timestamp: u64) -> RequestSpec {
    make_public_item_request_with_config(target, timestamp, &StoreConfig::default())
}

pub fn make_public_item_request_with_config(
    target: &StoreTarget,
    timestamp: u64,
    config: &StoreConfig,
) -> RequestSpec {
    RequestSpec {
        url: store_url("/api/app/v1/item/info", "0", timestamp, config),
        method: "POST",
        headers: BTreeMap::from([
            ("Content-Type".into(), "application/json".into()),
            ("Locale".into(), config.language.clone()),
        ]),
        body: serde_json::json!({ "package_name": target.package_name }).to_string(),
    }
}

fn auth_headers(
    auth: &PicoAuth,
    config: &StoreConfig,
) -> Result<BTreeMap<String, String>, SdkError> {
    if auth.x_tt_token.is_empty() && auth.cookies.is_empty() {
        return Err(SdkError("authenticated PICO session required".into()));
    }
    let mut headers = BTreeMap::from([
        ("Content-Type".into(), "application/json".into()),
        ("Locale".into(), config.language.clone()),
    ]);
    if !auth.x_tt_token.is_empty() {
        headers.insert("X-Tt-Token".into(), auth.x_tt_token.clone());
    }
    if !auth.cookies.is_empty() {
        headers.insert(
            "Cookie".into(),
            auth.cookies
                .iter()
                .map(|(key, value)| format!("{key}={value}"))
                .collect::<Vec<_>>()
                .join("; "),
        );
    }
    Ok(headers)
}

pub fn make_account_item_request(
    auth: &PicoAuth,
    target: &StoreTarget,
    config: &StoreConfig,
) -> Result<RequestSpec, SdkError> {
    Ok(RequestSpec {
        url: store_url(
            "/api/app/v1/item/info",
            &auth.uid,
            current_timestamp(),
            config,
        ),
        method: "POST",
        headers: auth_headers(auth, config)?,
        body: serde_json::json!({"package_name": target.package_name}).to_string(),
    })
}

pub fn make_free_acquisition_request(
    auth: &PicoAuth,
    item: &PublicItem,
    config: &StoreConfig,
) -> Result<RequestSpec, SdkError> {
    if !is_free_price(&item.price) || item.currency.is_empty() {
        return Err(SdkError("free app price and currency required".into()));
    }
    Ok(RequestSpec {
        url: store_url(
            "/api/app/v1/item/price",
            &auth.uid,
            current_timestamp(),
            config,
        ),
        method: "POST",
        headers: auth_headers(auth, config)?,
        body: format!(
            r#"{{"item_id":{},"is_free_entitlment":true,"currency":{},"amount":{},"support_cross_pay":false}}"#,
            item.item_id,
            serde_json::json!(item.currency),
            serde_json::json!(item.price)
        ),
    })
}

pub fn parse_free_acquisition(text: &str) -> Result<String, SdkError> {
    let root: Value = serde_json::from_str(text).map_err(|error| SdkError(error.to_string()))?;
    let id = item_id(&root["data"]["order_id"]).unwrap_or_default();
    if root["code"].as_i64() != Some(0)
        || root["data"]["free"].as_bool() != Some(true)
        || id.starts_with('0')
        || id.is_empty()
    {
        return Err(SdkError("PICO did not confirm a free order".into()));
    }
    Ok(id)
}

fn is_free_price(price: &str) -> bool {
    price == "0"
        || price
            .strip_prefix("0.")
            .is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|b| b == b'0'))
}

pub fn make_search_request(word: &str, next_id: u64) -> Result<RequestSpec, SdkError> {
    make_search_request_with_config(word, next_id, &StoreConfig::default())
}

pub fn make_search_request_with_config(
    word: &str,
    next_id: u64,
    config: &StoreConfig,
) -> Result<RequestSpec, SdkError> {
    if word.trim().is_empty() || word.len() > 100 || next_id == 0 {
        return Err(SdkError("valid search word and page required".into()));
    }
    Ok(RequestSpec {
        url: store_url(
            "/api/app/v2/search/aggregation",
            "0",
            current_timestamp(),
            config,
        ),
        method: "POST",
        headers: BTreeMap::from([
            ("Content-Type".into(), "application/json".into()),
            ("Locale".into(), config.language.clone()),
        ]),
        body: serde_json::json!({"word":word.trim(),"pageable":{"next_id":next_id,"size":20}})
            .to_string(),
    })
}

pub fn parse_search_results(text: &str) -> Result<SearchResults, SdkError> {
    let root: Value = serde_json::from_str(text).map_err(|error| SdkError(error.to_string()))?;
    if root["code"].as_i64() != Some(0) {
        return Err(SdkError("PICO search failed".into()));
    }
    let groups = root["data"]["search_list"]
        .as_array()
        .ok_or_else(|| SdkError("PICO search failed".into()))?;
    let mut items = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    let mut next_id = None;
    for group in groups {
        if let Some(members) = group["items"].as_array() {
            for entry in members {
                let id = item_id(&entry["item_id"]).unwrap_or_default();
                let package = entry["package_name"].as_str().unwrap_or_default();
                if StoreTarget::new(&id, package, "").is_err() || !seen.insert(id.clone()) {
                    continue;
                }
                items.push(SearchItem {
                    item_id: id,
                    package_name: package.into(),
                    name: text_or(entry.get("name"), package),
                    version_code: entry["version_code"].as_u64(),
                    price: text_or(entry.get("price"), ""),
                });
            }
        }
        if group["has_more"].as_bool() == Some(true) && next_id.is_none() {
            next_id = group["next_id"].as_u64().filter(|id| *id > 0);
        }
    }
    Ok(SearchResults { items, next_id })
}

fn item_id(value: &Value) -> Option<String> {
    match value {
        Value::Number(number) => Some(number.to_string()),
        Value::String(text) => Some(text.clone()),
        _ => None,
    }
}

fn text_or(value: Option<&Value>, fallback: &str) -> String {
    match value {
        Some(Value::String(text)) if !text.is_empty() => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => fallback.into(),
    }
}

pub fn parse_public_item(text: &str) -> Result<PublicItem, SdkError> {
    parse_public_item_for(text, &StoreTarget::default())
}

pub fn parse_public_item_for(text: &str, target: &StoreTarget) -> Result<PublicItem, SdkError> {
    parse_public_item_with_config(text, target, &StoreConfig::default())
}

pub fn parse_public_item_with_config(
    text: &str,
    target: &StoreTarget,
    config: &StoreConfig,
) -> Result<PublicItem, SdkError> {
    let root: Value = serde_json::from_str(text).map_err(|error| SdkError(error.to_string()))?;
    if root.get("code").and_then(Value::as_i64) != Some(0) {
        return Err(SdkError("PICO item lookup failed".into()));
    }
    let data = root
        .get("data")
        .ok_or_else(|| SdkError("missing item data".into()))?;
    if item_id(&data["item_id"]).as_deref() != Some(target.item_id.as_str())
        || data["package_name"].as_str() != Some(target.package_name.as_str())
    {
        return Err(SdkError(
            "PICO returned an unexpected item or package".into(),
        ));
    }
    let version = data["version_code"]
        .as_u64()
        .filter(|value| *value > 0)
        .ok_or_else(|| SdkError("PICO returned an invalid version code".into()))?;
    let icon = data["icon"]
        .as_str()
        .filter(|value| value.starts_with("https://"))
        .map(str::to_owned);
    Ok(PublicItem {
        item_id: target.item_id.clone(),
        package_name: target.package_name.clone(),
        name: text_or(data.get("name"), &target.name),
        version_code: version,
        price: text_or(data.get("price"), ""),
        currency: text_or(data.get("currency"), ""),
        icon_url: icon,
        summary: text_or(data.get("abstract"), ""),
        description: text_or(data["description"].get("app_description"), ""),
        publisher: text_or(data["detail"].get("app_publisher"), ""),
        genres: text_or(data["detail"].get("app_genres"), ""),
        app_version: text_or(data["detail"].get("app_version"), ""),
        official_url: format!(
            "{}/{}/detail/1/{}",
            config.web_store_host.trim_end_matches('/'),
            config.web_region,
            target.item_id
        ),
        entitlement_status: data["entitlement_status"].as_i64(),
        offer_exists: data["is_offer_exist"].as_bool(),
    })
}

pub fn encode_account_field(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| format!("{:02x}", byte ^ 5))
        .collect()
}

pub fn make_account_request(
    kind: &str,
    email: &str,
    code: Option<&str>,
) -> Result<RequestSpec, SdkError> {
    make_account_request_with_config(kind, email, code, &StoreConfig::default())
}

pub fn make_account_request_with_config(
    kind: &str,
    email: &str,
    code: Option<&str>,
    config: &StoreConfig,
) -> Result<RequestSpec, SdkError> {
    let valid_email = email.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && !local.contains('@')
            && domain
                .split_once('.')
                .is_some_and(|(left, right)| !left.is_empty() && !right.is_empty())
            && !email.chars().any(char::is_whitespace)
    });
    if !valid_email {
        return Err(SdkError("valid email required".into()));
    }
    if kind != "send-code" && kind != "login" || kind == "login" && code.unwrap_or("").is_empty() {
        return Err(SdkError("invalid account action or missing code".into()));
    }
    let path = if kind == "send-code" {
        "/passport/email/send_code/"
    } else {
        "/passport/app/email/code_login/"
    };
    let mut url = Url::parse(&config.account_host).expect("valid account URL");
    url.set_path(path);
    url.query_pairs_mut()
        .append_pair("multi_login", "1")
        .append_pair("account_sdk_source", "app")
        .append_pair("passport-sdk-version", "30490")
        .append_pair("aid", &config.passport_aid)
        .append_pair("device_platform", &config.device_platform);
    let fields: Vec<(&str, String)> = if kind == "send-code" {
        vec![
            ("email", encode_account_field(email)),
            ("type", encode_account_field("13")),
            ("email_logic_type", "0".into()),
            ("mix_mode", "1".into()),
        ]
    } else {
        vec![
            ("email", encode_account_field(email)),
            ("ect_type", "13".into()),
            ("code", encode_account_field(code.unwrap_or_default())),
            ("mix_mode", "1".into()),
            ("email_logic_type", "0".into()),
        ]
    };
    let mut encoded = url::form_urlencoded::Serializer::new(String::new());
    encoded.extend_pairs(fields);
    Ok(RequestSpec {
        url: url.into(),
        method: "POST",
        headers: BTreeMap::from([(
            "Content-Type".into(),
            "application/x-www-form-urlencoded".into(),
        )]),
        body: encoded.finish(),
    })
}

pub fn make_download_info_request(auth: &PicoAuth) -> Result<RequestSpec, SdkError> {
    make_download_info_request_for(auth, &StoreTarget::default())
}

pub fn make_download_info_request_for(
    auth: &PicoAuth,
    target: &StoreTarget,
) -> Result<RequestSpec, SdkError> {
    make_download_info_request_with_config(auth, target, &StoreConfig::default())
}

pub fn make_download_info_request_with_config(
    auth: &PicoAuth,
    target: &StoreTarget,
    config: &StoreConfig,
) -> Result<RequestSpec, SdkError> {
    Ok(RequestSpec {
        url: store_url(
            "/api/app/v1/download/info",
            &auth.uid,
            current_timestamp(),
            config,
        ),
        method: "POST",
        headers: auth_headers(auth, config)?,
        body: format!(
            r#"{{"item_id":{},"package_name":"{}"}}"#,
            target.item_id, target.package_name
        ),
    })
}

pub fn parse_download_info(text: &str) -> Result<DownloadInfo, SdkError> {
    parse_download_info_for(text, &StoreTarget::default())
}

pub fn parse_download_info_for(text: &str, target: &StoreTarget) -> Result<DownloadInfo, SdkError> {
    let root: Value = serde_json::from_str(text).map_err(|error| SdkError(error.to_string()))?;
    if root.get("code").and_then(Value::as_i64) != Some(0) {
        return Err(SdkError("PICO download info failed".into()));
    }
    let data = root
        .get("data")
        .ok_or_else(|| SdkError("missing download data".into()))?;
    let package = data
        .get("package")
        .ok_or_else(|| SdkError("missing package data".into()))?;
    if item_id(&data["item_id"]).as_deref() != Some(target.item_id.as_str())
        || package["package_name"].as_str() != Some(target.package_name.as_str())
    {
        return Err(SdkError(
            "PICO returned an unexpected download package".into(),
        ));
    }
    let version = package["version_code"].as_u64().filter(|value| *value > 0);
    let size = package["size"].as_u64().filter(|value| *value > 0);
    let md5 = package["md5"]
        .as_str()
        .filter(|value| value.len() == 32 && value.chars().all(|c| c.is_ascii_hexdigit()));
    let url = package["path"]
        .as_str()
        .filter(|value| value.starts_with("https://"));
    match (version, size, md5, url) {
        (Some(version_code), Some(size), Some(md5), Some(url)) => Ok(DownloadInfo {
            item_id: target.item_id.clone(),
            package_name: target.package_name.clone(),
            version_code,
            version: text_or(package.get("version"), ""),
            size,
            md5: md5.to_ascii_lowercase(),
            url: url.into(),
        }),
        _ => Err(SdkError("PICO returned incomplete APK metadata".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Fixture {
        item_id: String,
        package_name: String,
        version_code: u64,
        apk_size: u64,
        md5: String,
        public_response: String,
        download_response: String,
    }

    #[test]
    fn shared_contract_fixture() {
        let fixture: Fixture =
            serde_json::from_str(include_str!("../../../contracts/v1/fixtures.json")).unwrap();
        let request = make_public_item_request_at(1);
        assert!(request.url.contains("device_name=A9210"));
        assert_eq!(
            serde_json::from_str::<Value>(&request.body).unwrap()["package_name"],
            fixture.package_name
        );
        let item = parse_public_item(&fixture.public_response).unwrap();
        let download = parse_download_info(&fixture.download_response).unwrap();
        assert_eq!(item.item_id, fixture.item_id);
        assert_eq!(item.version_code, fixture.version_code);
        assert_eq!(download.size, fixture.apk_size);
        assert_eq!(download.md5, fixture.md5);
        assert_eq!(
            mirror_decision(&item.price, download.size, &MirrorPolicy::default()).unwrap(),
            MirrorReason::Eligible
        );
    }

    #[test]
    fn rejects_wrong_package() {
        let wrong = r#"{"code":0,"data":{"item_id":7288745304105664518,"package_name":"bad","version_code":1}}"#;
        assert!(parse_public_item(wrong).is_err());
    }

    #[test]
    fn search_preserves_non_seed_item_id() {
        let request = make_search_request("YouTube", 1).unwrap();
        assert!(request.url.contains("/api/app/v2/search/aggregation"));
        let response = r#"{"code":0,"data":{"search_list":[{"items":[{"item_id":7270207384512020485,"package_name":"com.google.android.apps.youtube.vr.pico","name":"YouTube VR"},{"item_id":7574402934302343167,"name":"Bundle"}]}]}}"#;
        let result = parse_search_results(response).unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].item_id, "7270207384512020485");
    }
}
