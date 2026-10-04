//! Complete store acquisition workflow on top of the public protocol API.

use crate::{
    DownloadInfo, PicoAuth, PublicItem, RequestSpec, SdkError, SearchResults, StoreConfig,
    StoreTarget, make_account_item_request, make_account_request_with_config,
    make_download_info_request_with_config, make_free_acquisition_request,
    make_public_item_request_with_config, make_search_request_with_config, parse_download_info_for,
    parse_free_acquisition, parse_public_item_with_config, parse_search_results,
};
use md5::{Digest, Md5};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

pub struct StoreResponse {
    pub body: String,
    pub token: String,
    pub cookies: BTreeMap<String, String>,
}

pub trait Transport {
    fn post(&self, request: &RequestSpec, retries: usize) -> Result<StoreResponse, SdkError>;
}

#[derive(Default)]
pub struct HttpTransport;

impl Transport for HttpTransport {
    fn post(&self, request: &RequestSpec, retries: usize) -> Result<StoreResponse, SdkError> {
        if retries == 0 {
            return Err(SdkError("at least one request attempt required".into()));
        }
        let mut last_error = String::new();
        for attempt in 0..retries {
            let mut builder = ureq::post(&request.url);
            for (key, value) in &request.headers {
                builder = builder.header(key, value);
            }
            match builder.send(&request.body) {
                Ok(mut response) => {
                    let token = response
                        .headers()
                        .get("x-tt-token")
                        .and_then(|value| value.to_str().ok())
                        .unwrap_or("")
                        .to_string();
                    let mut cookies = BTreeMap::new();
                    for value in response.headers().get_all("set-cookie") {
                        if let Ok(line) = value.to_str()
                            && let Some((key, val)) =
                                line.split(';').next().and_then(|part| part.split_once('='))
                        {
                            cookies.insert(key.to_string(), val.to_string());
                        }
                    }
                    let body = response
                        .body_mut()
                        .read_to_string()
                        .map_err(|error| SdkError(error.to_string()))?;
                    return Ok(StoreResponse {
                        body,
                        token,
                        cookies,
                    });
                }
                Err(error) => {
                    if let ureq::Error::StatusCode(status) = error
                        && status < 500
                        && status != 429
                    {
                        return Err(SdkError(format!("PICO HTTP {status}")));
                    }
                    last_error = error.to_string();
                }
            }
            if attempt + 1 < retries {
                thread::sleep(Duration::from_secs((attempt + 1).min(5) as u64));
            }
        }
        Err(SdkError(format!("PICO request failed: {last_error}")))
    }
}

pub struct PicoStoreClient<T: Transport = HttpTransport> {
    pub transport: T,
    pub config: StoreConfig,
}

impl Default for PicoStoreClient<HttpTransport> {
    fn default() -> Self {
        Self {
            transport: HttpTransport,
            config: StoreConfig::default(),
        }
    }
}

impl<T: Transport> PicoStoreClient<T> {
    pub fn new(transport: T) -> Self {
        Self {
            transport,
            config: StoreConfig::default(),
        }
    }

    pub fn with_config(transport: T, config: StoreConfig) -> Self {
        Self { transport, config }
    }

    pub fn search(&self, word: &str, next_id: u64) -> Result<SearchResults, SdkError> {
        let spec = make_search_request_with_config(word, next_id, &self.config)?;
        parse_search_results(&self.transport.post(&spec, 3)?.body)
    }

    pub fn item(&self, target: &StoreTarget) -> Result<PublicItem, SdkError> {
        let spec =
            make_public_item_request_with_config(target, crate::current_timestamp(), &self.config);
        parse_public_item_with_config(&self.transport.post(&spec, 3)?.body, target, &self.config)
    }

    pub fn account_item(
        &self,
        target: &StoreTarget,
        auth: &PicoAuth,
    ) -> Result<PublicItem, SdkError> {
        let spec = make_account_item_request(auth, target, &self.config)?;
        parse_public_item_with_config(&self.transport.post(&spec, 3)?.body, target, &self.config)
    }

    pub fn acquire_free(&self, item: &PublicItem, auth: &PicoAuth) -> Result<String, SdkError> {
        let spec = make_free_acquisition_request(auth, item, &self.config)?;
        parse_free_acquisition(&self.transport.post(&spec, 1)?.body)
    }

    pub fn ensure_entitlement(
        &self,
        target: &StoreTarget,
        auth: &PicoAuth,
    ) -> Result<PublicItem, SdkError> {
        let current = self.account_item(target, auth)?;
        if current.entitlement_status == Some(1) {
            return Ok(current);
        }
        if current.offer_exists != Some(true) {
            return Err(SdkError("PICO has no offer for this account region".into()));
        }
        if !(current.price == "0"
            || current
                .price
                .strip_prefix("0.")
                .is_some_and(|v| !v.is_empty() && v.bytes().all(|b| b == b'0')))
        {
            return Err(SdkError("PICO app is not free or already owned".into()));
        }
        let acquisition_error = self.acquire_free(&current, auth).err();
        for attempt in 0..3 {
            let updated = match self.account_item(target, auth) {
                Ok(updated) => updated,
                Err(error) => {
                    if attempt == 2 {
                        return Err(acquisition_error.unwrap_or(error));
                    }
                    thread::sleep(Duration::from_millis(400));
                    continue;
                }
            };
            if updated.entitlement_status == Some(1) {
                return Ok(updated);
            }
            if attempt < 2 {
                thread::sleep(Duration::from_millis(400));
            }
        }
        if let Some(error) = acquisition_error {
            return Err(error);
        }
        Err(SdkError(
            "PICO entitlement was not confirmed after free acquisition".into(),
        ))
    }

    pub fn send_code(&self, email: &str) -> Result<(), SdkError> {
        let spec = make_account_request_with_config("send-code", email, None, &self.config)?;
        account_data(&self.transport.post(&spec, 1)?.body)?;
        Ok(())
    }

    pub fn login(&self, email: &str, code: &str) -> Result<PicoAuth, SdkError> {
        let spec = make_account_request_with_config("login", email, Some(code), &self.config)?;
        let response = self.transport.post(&spec, 1)?;
        let data = account_data(&response.body)?;
        let uid = data["user_id_str"]
            .as_str()
            .map(str::to_string)
            .or_else(|| data["user_id"].as_u64().map(|id| id.to_string()))
            .unwrap_or_else(|| "0".into());
        let auth = PicoAuth {
            uid,
            x_tt_token: response.token,
            cookies: response.cookies,
        };
        if auth.x_tt_token.is_empty() && auth.cookies.is_empty() {
            return Err(SdkError("PICO login returned no usable session".into()));
        }
        Ok(auth)
    }

    pub fn download_info(
        &self,
        target: &StoreTarget,
        auth: &PicoAuth,
    ) -> Result<DownloadInfo, SdkError> {
        let spec = make_download_info_request_with_config(auth, target, &self.config)?;
        parse_download_info_for(&self.transport.post(&spec, 3)?.body, target)
    }

    pub fn download(
        &self,
        target: &StoreTarget,
        auth: &PicoAuth,
        output: &Path,
    ) -> Result<(), SdkError> {
        self.ensure_entitlement(target, auth)?;
        download_verified_apk(&self.download_info(target, auth)?, output)
    }
}

fn account_data(body: &str) -> Result<Value, SdkError> {
    let root: Value = serde_json::from_str(body).map_err(|error| SdkError(error.to_string()))?;
    if root["message"] != "success" {
        return Err(SdkError("PICO account request rejected".into()));
    }
    Ok(root["data"].clone())
}

static DOWNLOAD_SEQUENCE: AtomicU64 = AtomicU64::new(0);

struct DownloadFile {
    path: PathBuf,
    file: Option<File>,
}

impl DownloadFile {
    fn new(output: &Path) -> Result<Self, SdkError> {
        let name = output.file_name().unwrap_or_default().to_string_lossy();
        for _ in 0..64 {
            let sequence = DOWNLOAD_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path =
                output.with_file_name(format!("{name}.{}.{sequence}.part", std::process::id()));
            match OpenOptions::new()
                .create_new(true)
                .read(true)
                .write(true)
                .open(&path)
            {
                Ok(file) => {
                    return Ok(Self {
                        path,
                        file: Some(file),
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(SdkError(error.to_string())),
            }
        }
        Err(SdkError(
            "could not create an isolated APK temporary file".into(),
        ))
    }

    fn size(&self) -> Result<u64, SdkError> {
        self.file
            .as_ref()
            .unwrap()
            .metadata()
            .map(|meta| meta.len())
            .map_err(|error| SdkError(error.to_string()))
    }

    fn reset(&mut self) -> Result<(), SdkError> {
        let file = self.file.as_mut().unwrap();
        file.set_len(0)
            .and_then(|_| file.seek(SeekFrom::Start(0)))
            .map(|_| ())
            .map_err(|error| SdkError(error.to_string()))
    }

    fn receive(
        &mut self,
        start: u64,
        status: u16,
        range: Option<&str>,
        mut reader: impl Read,
    ) -> Result<(), SdkError> {
        if start > 0 {
            if status == 200 {
                self.reset()?;
            } else if status != 206 || !valid_resume_range(range.unwrap_or(""), start) {
                self.reset()?;
                return Err(SdkError("CDN refused a safe resume range".into()));
            }
        }
        let file = self.file.as_mut().unwrap();
        file.seek(SeekFrom::End(0))
            .map_err(|error| SdkError(error.to_string()))?;
        std::io::copy(&mut reader, file).map_err(|error| SdkError(error.to_string()))?;
        Ok(())
    }

    fn verify(&mut self, info: &DownloadInfo) -> Result<(), SdkError> {
        let file = self.file.as_mut().unwrap();
        file.seek(SeekFrom::Start(0))
            .map_err(|error| SdkError(error.to_string()))?;
        let mut digest = Md5::new();
        let mut buffer = [0u8; 65536];
        loop {
            let count = file
                .read(&mut buffer)
                .map_err(|error| SdkError(error.to_string()))?;
            if count == 0 {
                break;
            }
            digest.update(&buffer[..count]);
        }
        if format!("{:x}", digest.finalize()) != info.md5 {
            return Err(SdkError("APK digest mismatch".into()));
        }
        Ok(())
    }
}

impl Drop for DownloadFile {
    fn drop(&mut self) {
        drop(self.file.take());
        let _ = fs::remove_file(&self.path);
    }
}

fn valid_resume_range(value: &str, start: u64) -> bool {
    value.starts_with(&format!("bytes {start}-"))
}

fn download_with(
    info: &DownloadInfo,
    output: &Path,
    mut transfer: impl FnMut(&mut DownloadFile) -> Result<(), SdkError>,
    mut pause: impl FnMut(usize),
) -> Result<(), SdkError> {
    if !info.url.starts_with("https://")
        || output.extension().and_then(|x| x.to_str()) != Some("apk")
    {
        return Err(SdkError(
            "HTTPS APK URL and .apk output are required".into(),
        ));
    }
    if output.exists() {
        return Err(SdkError("output APK already exists".into()));
    }
    let mut temporary = DownloadFile::new(output)?;
    let mut last_error = String::new();
    for attempt in 0..8 {
        match transfer(&mut temporary) {
            Ok(()) => {
                temporary.verify(info)?;
                fs::hard_link(&temporary.path, output)
                    .map_err(|error| SdkError(error.to_string()))?;
                return Ok(());
            }
            Err(error) => last_error = error.0,
        }
        if attempt < 7 {
            pause(attempt);
        }
    }
    Err(SdkError(format!("APK download failed: {last_error}")))
}

pub fn download_verified_apk(info: &DownloadInfo, output: &Path) -> Result<(), SdkError> {
    download_with(
        info,
        output,
        |temporary| {
            let start = temporary.size()?;
            let mut builder = ureq::get(&info.url);
            if start > 0 {
                builder = builder.header("Range", format!("bytes={start}-"));
            }
            let mut response = match builder.call() {
                Ok(response) => response,
                Err(error) => {
                    if matches!(error, ureq::Error::StatusCode(416)) {
                        temporary.reset()?;
                    }
                    return Err(SdkError(error.to_string()));
                }
            };
            let status = response.status().as_u16();
            let range = response
                .headers()
                .get("content-range")
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            temporary.receive(
                start,
                status,
                range.as_deref(),
                response.body_mut().as_reader(),
            )
        },
        |attempt| thread::sleep(Duration::from_secs((attempt + 1).min(5) as u64)),
    )
}

#[cfg(test)]
mod download_tests {
    use super::*;
    use std::io::{Cursor, Error, ErrorKind};
    use std::sync::{Arc, Barrier};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let sequence = DOWNLOAD_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir()
                .join(format!("sdk-apk-test-{}-{sequence}", std::process::id()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn output(&self) -> PathBuf {
            self.0.join("sample.apk")
        }
        fn count(&self) -> usize {
            fs::read_dir(&self.0).unwrap().count()
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn info(body: &[u8]) -> DownloadInfo {
        DownloadInfo {
            item_id: "1".into(),
            package_name: "dev.example.synthetic".into(),
            version_code: 1,
            version: "1".into(),
            size: body.len() as u64,
            md5: format!("{:x}", Md5::digest(body)),
            url: "https://cdn.example.invalid/synthetic.apk".into(),
        }
    }

    fn full_download(info: &DownloadInfo, output: &Path, body: &[u8]) -> Result<(), SdkError> {
        download_with(
            info,
            output,
            |temporary| {
                let start = temporary.size()?;
                temporary.receive(start, 200, None, Cursor::new(body))
            },
            |_| {},
        )
    }

    struct InterruptedReader {
        prefix: Option<Vec<u8>>,
    }

    impl Read for InterruptedReader {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            if let Some(prefix) = self.prefix.take() {
                let count = prefix.len().min(buffer.len());
                buffer[..count].copy_from_slice(&prefix[..count]);
                Ok(count)
            } else {
                Err(Error::new(
                    ErrorKind::ConnectionReset,
                    "synthetic interruption",
                ))
            }
        }
    }

    #[test]
    fn ignores_unowned_bad_partial_and_publishes_verified_bytes() {
        let directory = TestDirectory::new();
        let output = directory.output();
        let legacy = output.with_extension("part.apk");
        fs::write(&legacy, b"unowned bad partial").unwrap();
        let body = b"synthetic APK";
        full_download(&info(body), &output, body).unwrap();
        assert_eq!(fs::read(&output).unwrap(), body);
        assert_eq!(fs::read(&legacy).unwrap(), b"unowned bad partial");
        assert_eq!(directory.count(), 2);
    }

    #[test]
    fn metadata_size_differences_do_not_block_verified_content() {
        let body = b"synthetic APK";
        for size in [body.len() as u64 - 1, body.len() as u64 + 1] {
            let directory = TestDirectory::new();
            let mut metadata = info(body);
            metadata.size = size;
            full_download(&metadata, &directory.output(), body).unwrap();
            assert_eq!(fs::read(directory.output()).unwrap(), body);
            assert_eq!(directory.count(), 1);
        }
    }

    #[test]
    fn digest_mismatch_preserves_existing_failure_behavior_and_cleans_up() {
        let body = b"synthetic APK";
        let directory = TestDirectory::new();
        assert_eq!(
            full_download(&info(body), &directory.output(), b"wrong content")
                .unwrap_err()
                .0,
            "APK digest mismatch"
        );
        assert_eq!(directory.count(), 0);
        full_download(&info(body), &directory.output(), body).unwrap();
        assert_eq!(fs::read(directory.output()).unwrap(), body);
    }

    #[test]
    fn safely_resumes_after_an_interrupted_response() {
        let directory = TestDirectory::new();
        let body = b"synthetic APK";
        let metadata = info(body);
        let mut starts = Vec::new();
        download_with(
            &metadata,
            &directory.output(),
            |temporary| {
                let start = temporary.size()?;
                starts.push(start);
                if start == 0 {
                    temporary.receive(
                        start,
                        200,
                        None,
                        InterruptedReader {
                            prefix: Some(body[..2].to_vec()),
                        },
                    )
                } else {
                    temporary.receive(start, 206, Some("bytes 2-12/13"), Cursor::new(&body[2..]))
                }
            },
            |_| {},
        )
        .unwrap();
        assert_eq!(starts, [0, 2]);
        assert_eq!(fs::read(directory.output()).unwrap(), body);
        assert_eq!(directory.count(), 1);
    }

    #[test]
    fn ignored_range_restarts_from_the_full_response() {
        let directory = TestDirectory::new();
        let body = b"synthetic APK";
        let metadata = info(body);
        let mut attempts = 0;
        download_with(
            &metadata,
            &directory.output(),
            |temporary| {
                let start = temporary.size()?;
                attempts += 1;
                if attempts == 1 {
                    temporary.receive(
                        start,
                        200,
                        None,
                        InterruptedReader {
                            prefix: Some(body[..2].to_vec()),
                        },
                    )
                } else {
                    assert_eq!(start, 2);
                    temporary.receive(start, 200, None, Cursor::new(body))
                }
            },
            |_| {},
        )
        .unwrap();
        assert_eq!(attempts, 2);
        assert_eq!(fs::read(directory.output()).unwrap(), body);
    }

    #[test]
    fn wrong_range_offset_is_rejected_before_appending_and_retried_cleanly() {
        let directory = TestDirectory::new();
        let body = b"synthetic APK";
        let metadata = info(body);
        let mut starts = Vec::new();
        download_with(
            &metadata,
            &directory.output(),
            |temporary| {
                let start = temporary.size()?;
                starts.push(start);
                match starts.len() {
                    1 => temporary.receive(
                        start,
                        200,
                        None,
                        InterruptedReader {
                            prefix: Some(body[..2].to_vec()),
                        },
                    ),
                    2 => temporary.receive(
                        start,
                        206,
                        Some("bytes 3-12/13"),
                        Cursor::new(&body[2..]),
                    ),
                    _ => temporary.receive(start, 200, None, Cursor::new(body)),
                }
            },
            |_| {},
        )
        .unwrap();
        assert_eq!(starts, [0, 2, 0]);
        assert_eq!(fs::read(directory.output()).unwrap(), body);
    }

    #[test]
    fn exhausted_retries_remove_the_partial_and_preserve_existing_outputs() {
        let directory = TestDirectory::new();
        let body = b"synthetic APK";
        let metadata = info(body);
        let mut attempts = 0;
        assert!(
            download_with(
                &metadata,
                &directory.output(),
                |temporary| {
                    attempts += 1;
                    if attempts == 1 {
                        temporary.receive(
                            0,
                            200,
                            None,
                            InterruptedReader {
                                prefix: Some(body[..2].to_vec()),
                            },
                        )
                    } else {
                        Err(SdkError("synthetic interruption".into()))
                    }
                },
                |_| {}
            )
            .is_err()
        );
        assert_eq!(attempts, 8);
        assert_eq!(directory.count(), 0);
        fs::write(directory.output(), b"last known good").unwrap();
        assert!(
            download_with(
                &metadata,
                &directory.output(),
                |_| panic!("must not connect"),
                |_| {}
            )
            .is_err()
        );
        assert_eq!(fs::read(directory.output()).unwrap(), b"last known good");
    }

    #[test]
    fn competing_downloads_publish_only_the_winners_verified_file() {
        let directory = TestDirectory::new();
        let output = directory.output();
        let barrier = Arc::new(Barrier::new(2));
        let handles: Vec<_> = [b"first APK bytes".to_vec(), b"other APK bytes".to_vec()]
            .into_iter()
            .map(|body| {
                let output = output.clone();
                let barrier = barrier.clone();
                thread::spawn(move || {
                    let metadata = info(&body);
                    let result = download_with(
                        &metadata,
                        &output,
                        |temporary| {
                            temporary.receive(0, 200, None, Cursor::new(&body))?;
                            barrier.wait();
                            Ok(())
                        },
                        |_| {},
                    );
                    (body, result)
                })
            })
            .collect();
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert_eq!(
            results.iter().filter(|(_, result)| result.is_ok()).count(),
            1
        );
        let winner = results.iter().find(|(_, result)| result.is_ok()).unwrap();
        assert_eq!(fs::read(&output).unwrap(), winner.0);
        assert_eq!(directory.count(), 1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicBool, Ordering};

    struct FixtureTransport;

    impl Transport for FixtureTransport {
        fn post(&self, request: &RequestSpec, retries: usize) -> Result<StoreResponse, SdkError> {
            assert!(retries > 0);
            let body = if request.url.contains("search/aggregation") {
                r#"{"code":0,"data":{"search_list":[{"items":[{"item_id":7288745304105664518,"package_name":"com.vrchat.android"}]}]}}"#.into()
            } else if request.url.contains("item/info") {
                serde_json::from_str::<Value>(include_str!("../../../contracts/v1/fixtures.json"))
                    .unwrap()["publicResponse"]
                    .as_str()
                    .unwrap()
                    .into()
            } else if request.url.contains("send_code") {
                r#"{"message":"success"}"#.into()
            } else if request.url.contains("code_login") {
                r#"{"message":"success","data":{"user_id_str":"123"}}"#.into()
            } else {
                serde_json::from_str::<Value>(include_str!("../../../contracts/v1/fixtures.json"))
                    .unwrap()["downloadResponse"]
                    .as_str()
                    .unwrap()
                    .into()
            };
            Ok(StoreResponse {
                body,
                token: "token".into(),
                cookies: BTreeMap::from([("sessionid".into(), "abc".into())]),
            })
        }
    }

    #[test]
    fn full_client_flow_uses_injected_transport() {
        let client = PicoStoreClient::new(FixtureTransport);
        let found = client.search("sample", 1).unwrap();
        let target =
            StoreTarget::new(&found.items[0].item_id, &found.items[0].package_name, "").unwrap();
        assert_eq!(client.item(&target).unwrap().version_code, 972240);
        client.send_code("test@example.com").unwrap();
        let auth = client.login("test@example.com", "123456").unwrap();
        assert_eq!(auth.cookies["sessionid"], "abc");
        assert_eq!(
            client.download_info(&target, &auth).unwrap().size,
            333887069
        );
    }

    struct EntitlementTransport {
        owned: AtomicBool,
        no_order: bool,
        calls: Mutex<Vec<String>>,
    }

    impl Transport for EntitlementTransport {
        fn post(&self, request: &RequestSpec, _: usize) -> Result<StoreResponse, SdkError> {
            assert!(request.url.contains("device_name=CustomDevice"));
            let path = url::Url::parse(&request.url).unwrap().path().to_string();
            self.calls.lock().unwrap().push(path.clone());
            let body = if path.ends_with("/item/info") {
                format!(
                    r#"{{"code":0,"data":{{"item_id":7288745304105664518,"package_name":"com.vrchat.android","name":"Sample","version_code":972240,"price":"0","currency":"JPY","entitlement_status":{},"is_offer_exist":true}}}}"#,
                    if self.owned.load(Ordering::SeqCst) {
                        1
                    } else {
                        2
                    }
                )
            } else if path.ends_with("/item/price") {
                assert_eq!(
                    serde_json::from_str::<Value>(&request.body).unwrap()["is_free_entitlment"],
                    true
                );
                self.owned.store(true, Ordering::SeqCst);
                if self.no_order {
                    r#"{"code":0,"data":{"free":true}}"#.into()
                } else {
                    r#"{"code":0,"data":{"free":true,"order_id":42}}"#.into()
                }
            } else {
                panic!("unexpected request: {path}")
            };
            Ok(StoreResponse {
                body,
                token: String::new(),
                cookies: BTreeMap::new(),
            })
        }
    }

    #[test]
    fn free_offer_precedes_download_and_uses_configured_identity() {
        let client = PicoStoreClient::with_config(
            EntitlementTransport {
                owned: AtomicBool::new(false),
                no_order: false,
                calls: Mutex::new(Vec::new()),
            },
            StoreConfig {
                device_name: "CustomDevice".into(),
                web_region: "us".into(),
                ..StoreConfig::default()
            },
        );
        let target = StoreTarget::default();
        let auth = PicoAuth {
            uid: "123".into(),
            x_tt_token: "token".into(),
            cookies: BTreeMap::new(),
        };
        let item = client.ensure_entitlement(&target, &auth).unwrap();
        assert!(item.official_url.contains("/us/detail/"));
        assert_eq!(
            *client.transport.calls.lock().unwrap(),
            [
                "/api/app/v1/item/info",
                "/api/app/v1/item/price",
                "/api/app/v1/item/info"
            ]
        );
    }

    #[test]
    fn missing_order_id_rechecks_committed_entitlement() {
        let client = PicoStoreClient::with_config(
            EntitlementTransport {
                owned: AtomicBool::new(false),
                no_order: true,
                calls: Mutex::new(Vec::new()),
            },
            StoreConfig {
                device_name: "CustomDevice".into(),
                ..StoreConfig::default()
            },
        );
        let auth = PicoAuth {
            uid: "123".into(),
            x_tt_token: "token".into(),
            cookies: BTreeMap::new(),
        };
        assert_eq!(
            client
                .ensure_entitlement(&StoreTarget::default(), &auth)
                .unwrap()
                .entitlement_status,
            Some(1)
        );
    }
}
