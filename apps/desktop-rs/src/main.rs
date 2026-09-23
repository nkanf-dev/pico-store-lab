#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod credentials;

use anyhow::Result;
use credentials::Account;
use gpui_kit::component::{
    Disableable, Root, Theme, ThemeMode,
    button::{Button, ButtonVariants},
    input::{Input, InputEvent, InputState},
};
use gpui_kit::prelude::*;
use gpui_kit::*;
use pico_store_lab::{PicoStoreClient, PublicItem, SearchItem, StoreTarget};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectLinks {
    github_host: String,
    github_api_host: String,
    github_owner: String,
    store_repository: String,
    website_origin: String,
    pico_registration_url: String,
}
impl ProjectLinks {
    fn load() -> Self {
        serde_json::from_str(include_str!("../../../project-links.json"))
            .expect("Invalid project-links.json")
    }
    fn latest_release_api(&self) -> String {
        format!(
            "https://{}/repos/{}/{}/releases/latest",
            self.github_api_host, self.github_owner, self.store_repository
        )
    }
    fn latest_release(&self) -> String {
        format!(
            "https://{}/{}/{}/releases/latest",
            self.github_host, self.github_owner, self.store_repository
        )
    }
}
const PAPER: u32 = 0xf1f0e8;
const INK: u32 = 0x191b16;
const ACCENT: u32 = 0xb63a20;
const MUTED: u32 = 0x61665b;

#[derive(Clone, Copy)]
struct Message(&'static str, &'static str);
impl Message {
    fn text(self, chinese: bool) -> &'static str {
        if chinese { self.1 } else { self.0 }
    }
}
const READY: Message = Message("Choose an app to get started.", "选择一个应用，开始下载。");
const REQUEST_FAILED: Message = Message(
    "Could not reach PICO. Try again in a moment.",
    "暂时无法连接 PICO，请稍后重试。",
);
const SESSION_FAILED: Message = Message(
    "Could not restore your account. Unlock your system keychain or sign in again.",
    "无法恢复登录，请解锁系统钥匙串或重新登录。",
);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogEntry {
    item_id: String,
    package_name: String,
    name: String,
}

struct Desktop {
    chinese: bool,
    search: Entity<InputState>,
    email: Entity<InputState>,
    code: Entity<InputState>,
    results: Vec<SearchItem>,
    selected: Option<StoreTarget>,
    detail: Option<PublicItem>,
    account: Option<Account>,
    next_id: Option<u64>,
    search_word: String,
    busy: bool,
    message: Message,
    is_error: bool,
    downloaded: Option<PathBuf>,
    available_update: Option<String>,
    settings_open: bool,
    _subscriptions: Vec<Subscription>,
}

impl Desktop {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let chinese = std::env::var("LANG").unwrap_or_default().starts_with("zh");
        let search = cx.new(|cx| InputState::new(window, cx).placeholder("VRChat, YouTube VR…"));
        let email = cx.new(|cx| InputState::new(window, cx).placeholder("you@example.com"));
        let code = cx.new(|cx| InputState::new(window, cx));
        let subscription = cx.subscribe_in(&search, window, |this, _, event, _, cx| {
            if matches!(event, InputEvent::PressEnter { .. }) {
                this.search(false, cx);
            }
        });
        let login_subscription = cx.subscribe_in(&code, window, |this, _, event, window, cx| {
            if matches!(event, InputEvent::PressEnter { .. }) {
                this.sign_in(window, cx);
            }
        });
        let results =
            serde_json::from_str::<Vec<CatalogEntry>>(include_str!("../assets/catalog.json"))
                .expect("bundled catalog")
                .into_iter()
                .map(|entry| SearchItem {
                    item_id: entry.item_id,
                    package_name: entry.package_name,
                    name: entry.name,
                    version_code: None,
                    cover_url: None,
                    price: String::new(),
                })
                .collect();
        let mut view = Self {
            chinese,
            search,
            email,
            code,
            results,
            selected: None,
            detail: None,
            account: None,
            next_id: None,
            search_word: String::new(),
            busy: false,
            message: READY,
            is_error: false,
            downloaded: None,
            available_update: None,
            settings_open: false,
            _subscriptions: vec![subscription, login_subscription],
        };
        view.run(
            Message("Opening your account…", "正在恢复登录…"),
            credentials::load,
            |this, result, cx| {
                match result {
                    Ok(account) => {
                        this.account = account;
                        this.message = READY;
                    }
                    Err(_) => this.fail(SESSION_FAILED),
                }
                cx.notify();
            },
            cx,
        );
        view
    }

    fn text(&self, en: &'static str, zh: &'static str) -> &'static str {
        if self.chinese { zh } else { en }
    }
    fn fail(&mut self, message: Message) {
        self.message = message;
        self.is_error = true;
    }

    // One operation at a time keeps app/account selection stable throughout a download.
    // Blocking SDK and keychain work always runs away from the UI thread.
    fn run<R: Send + 'static>(
        &mut self,
        message: Message,
        job: impl FnOnce() -> Result<R> + Send + 'static,
        complete: impl FnOnce(&mut Self, Result<R>, &mut Context<Self>) + 'static,
        cx: &mut Context<Self>,
    ) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.is_error = false;
        self.message = message;
        let task = cx.background_executor().spawn(async move { job() });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                complete(this, result, cx);
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn search(&mut self, more: bool, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let word = if more {
            self.search_word.clone()
        } else {
            self.search.read(cx).value().trim().to_owned()
        };
        if word.is_empty() {
            return;
        }
        let page = if more { self.next_id.unwrap_or(1) } else { 1 };
        let request_word = word.clone();
        self.run(
            Message("Searching…", "正在搜索…"),
            move || Ok(PicoStoreClient::default().search(&request_word, page)?),
            move |this, result, _| match result {
                Ok(results) => {
                    if !more {
                        this.results.clear();
                        this.selected = None;
                        this.detail = None;
                        this.downloaded = None;
                    }
                    for item in results.items {
                        if !this.results.iter().any(|old| old.item_id == item.item_id) {
                            this.results.push(item);
                        }
                    }
                    this.next_id = results.next_id.filter(|next| *next > page);
                    this.search_word = word;
                    this.message = if this.results.is_empty() {
                        Message(
                            "No apps found. Try another name.",
                            "没有找到应用，试试其他名称。",
                        )
                    } else {
                        READY
                    };
                }
                Err(_) => this.fail(REQUEST_FAILED),
            },
            cx,
        );
    }

    fn select(&mut self, target: StoreTarget, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.selected = Some(target.clone());
        self.detail = None;
        self.downloaded = None;
        let account = self.account.clone();
        self.run(Message("Loading app…", "正在加载应用…"), move || {
            let client = PicoStoreClient::default();
            Ok(match account { Some(account) => client.account_item(&target, &account.auth)?, None => client.item(&target)? })
        }, |this, result, _| match result {
            Ok(item) => { this.detail = Some(item); this.message = Message("Ready to download.", "可以开始下载了。"); }
            Err(_) => this.fail(Message("Could not load this app. Try again; if you are signed in, try signing in again.", "无法加载此应用，请重试；如果已登录，也可以尝试重新登录。")),
        }, cx);
    }

    fn send_code(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let email = self.email.read(cx).value().trim().to_owned();
        if !email.contains('@') {
            self.fail(Message(
                "Enter your PICO account email.",
                "请填写 PICO 账号邮箱。",
            ));
            cx.notify();
            return;
        }
        self.run(Message("Sending code…", "正在发送验证码…"), move || Ok(PicoStoreClient::default().send_code(&email)?), |this, result, _| match result {
            Ok(_) => this.message = Message("Code sent. Check your inbox, including spam.", "验证码已发送，请查收邮件，也可以查看垃圾邮件。"),
            Err(_) => this.fail(Message("Could not send a code. Check your email and try again later. New to PICO? Register below first.", "验证码发送失败，请检查邮箱并稍后重试。还没有账号的话，请先通过下方链接注册。")),
        }, cx);
    }

    fn sign_in(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let email = self.email.read(cx).value().trim().to_owned();
        let code = self.code.read(cx).value().trim().to_owned();
        if !email.contains('@') || code.is_empty() {
            self.fail(Message(
                "Enter your email and verification code.",
                "请填写邮箱和验证码。",
            ));
            cx.notify();
            return;
        }
        self.code
            .update(cx, |state, cx| state.set_value("", window, cx));
        self.run(Message("Signing in…", "正在登录…"), move || {
            let auth = PicoStoreClient::default().login(&email, &code)?;
            let account = Account { email, auth };
            credentials::save(&account)?;
            Ok(account)
        }, |this, result, cx| match result {
            Ok(account) => {
                this.account = Some(account);
                this.message = Message("Signed in.", "已登录。");
                if let Some(target) = this.selected.clone() { this.select(target, cx); }
            }
            Err(_) => this.fail(Message("Could not sign in. Check the code and make sure your system keychain is unlocked, then try again.", "登录失败，请检查验证码，并确认系统钥匙串已解锁后重试。")),
        }, cx);
    }

    fn sign_out(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.run(
            Message("Signing out…", "正在退出登录…"),
            credentials::clear,
            |this, result, cx| match result {
                Ok(()) => {
                    this.account = None;
                    this.detail = None;
                    this.downloaded = None;
                    this.message = Message("Signed out.", "已退出登录。");
                    if let Some(target) = this.selected.clone() {
                        this.select(target, cx);
                    }
                }
                Err(_) => this.fail(Message(
                    "Could not sign out. Unlock your system keychain and try again.",
                    "退出失败，请解锁系统钥匙串后重试。",
                )),
            },
            cx,
        );
    }

    fn download(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let (Some(target), Some(account)) = (self.selected.clone(), self.account.clone()) else {
            return;
        };
        let directory = directories::UserDirs::new()
            .and_then(|dirs| dirs.download_dir().map(PathBuf::from))
            .unwrap_or_else(|| PathBuf::from("."));
        let name = format!("{}.apk", target.package_name);
        let picker = cx.prompt_for_new_path(&directory, Some(&name));
        self.busy = true;
        self.is_error = false;
        self.message = Message("Choose where to save the APK.", "请选择 APK 的保存位置。");
        cx.spawn(async move |this, cx| {
            let selection = picker.await;
            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match selection {
                    Ok(Ok(Some(path))) => this.run(
                        Message("Downloading… Keep this window open until it finishes.", "正在下载… 请保持窗口打开，直到下载完成。"),
                        move || { PicoStoreClient::default().download(&target, &account.auth, &path)?; Ok(path) },
                        |this, result, _| match result {
                            Ok(path) => { this.downloaded = Some(path); this.message = Message("Download complete.", "下载完成。"); }
                            Err(_) => this.fail(Message("Download failed. Check your connection, account access, and available disk space, then try again. Choose a new filename if the file already exists.", "下载失败。请检查网络、账号是否拥有此应用以及剩余磁盘空间后重试；如果文件已存在，请换一个文件名。")),
                        }, cx),
                    Ok(Ok(None)) => this.message = Message("Download cancelled.", "已取消下载。"),
                    _ => this.fail(Message("Could not open the save dialog. Try again.", "无法打开保存窗口，请重试。")),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    fn check_updates(&mut self, cx: &mut Context<Self>) {
        self.run(
            Message("Checking for updates…", "正在检查更新…"),
            || {
                let mut response = ureq::get(&ProjectLinks::load().latest_release_api())
                    .header("User-Agent", "pico-store-desktop")
                    .call()?;
                let release: serde_json::Value =
                    serde_json::from_str(&response.body_mut().read_to_string()?)?;
                let version = semver::Version::parse(
                    release["tag_name"]
                        .as_str()
                        .unwrap_or("")
                        .trim_start_matches('v'),
                )?;
                Ok(
                    (version > semver::Version::parse(env!("CARGO_PKG_VERSION"))?)
                        .then(|| version.to_string()),
                )
            },
            |this, result, _| match result {
                Ok(version) => {
                    this.message = if version.is_some() {
                        Message(
                            "An update is available. Choose Download update above.",
                            "发现新版本，点击上方「下载更新」。",
                        )
                    } else {
                        Message("You're up to date.", "当前已是最新版本。")
                    };
                    this.available_update = version;
                }
                Err(_) => this.fail(Message(
                    "Could not check for updates. Try again later.",
                    "暂时无法检查更新，请稍后重试。",
                )),
            },
            cx,
        );
    }

    fn account_panel(&self, cx: &mut Context<Self>) -> AnyElement {
        let mut panel = div()
            .flex()
            .flex_col()
            .gap_3()
            .p_5()
            .bg(rgb(0xe7e7dd))
            .rounded_lg()
            .child(
                div()
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(self.text("YOUR PICO ACCOUNT", "你的 PICO 账号")),
            );
        if let Some(account) = &self.account {
            panel = panel
                .child(div().text_sm().child(account.email.clone()))
                .child(
                    Button::new("sign-out")
                        .label(self.text("Sign out", "退出登录"))
                        .disabled(self.busy)
                        .on_click(cx.listener(|this, _, _, cx| this.sign_out(cx))),
                );
        } else {
            panel =
                panel
                    .child(div().text_sm().child(
                        self.text("PICO international account email", "PICO 国际区账号邮箱"),
                    ))
                    .child(Input::new(&self.email).disabled(self.busy))
                    .child(
                        Button::new("send-code")
                            .label(self.text("Send code", "发送验证码"))
                            .disabled(self.busy)
                            .on_click(cx.listener(|this, _, _, cx| this.send_code(cx))),
                    )
                    .child(
                        div()
                            .text_sm()
                            .child(self.text("Email verification code", "邮箱验证码")),
                    )
                    .child(Input::new(&self.code).disabled(self.busy))
                    .child(
                        Button::new("sign-in")
                            .primary()
                            .label(self.text("Sign in", "登录"))
                            .disabled(self.busy)
                            .on_click(cx.listener(|this, _, window, cx| this.sign_in(window, cx))),
                    )
                    .child(div().text_sm().text_color(rgb(MUTED)).child(self.text(
                        "New to PICO? Create an international account, then come back to sign in.",
                        "还没有 PICO 国际区账号？先去注册，再回到这里登录。",
                    )))
                    .child(
                        Button::new("register")
                            .label(self.text("Register with PICO ↗", "前往 PICO 注册 ↗"))
                            .on_click(|_, _, cx| cx.open_url(&ProjectLinks::load().pico_registration_url)),
                    );
        }
        panel.into_any_element()
    }

    fn image_placeholder(label: &str) -> AnyElement {
        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .bg(rgb(0xe7e7dd))
            .text_color(rgb(MUTED))
            .child(label.to_owned())
            .into_any_element()
    }

    fn media_panel(
        url: Option<&String>,
        label: &str,
        width: Option<f32>,
        height: f32,
    ) -> AnyElement {
        let mut panel = div().h(px(height)).rounded_lg().overflow_hidden();
        if let Some(width) = width {
            panel = panel.w(px(width));
        } else {
            panel = panel.w_full();
        }
        let Some(url) = url else {
            return panel
                .child(Self::image_placeholder(label))
                .into_any_element();
        };
        let loading_label = label.to_owned();
        let fallback_label = label.to_owned();
        panel
            .child(
                img(url.clone())
                    .size_full()
                    .object_fit(ObjectFit::Cover)
                    .with_loading(move || Self::image_placeholder(&loading_label))
                    .with_fallback(move || Self::image_placeholder(&fallback_label)),
            )
            .into_any_element()
    }

    fn settings_panel(&self, cx: &mut Context<Self>) -> AnyElement {
        div()
            .flex()
            .flex_col()
            .gap_5()
            .max_w(px(720.))
            .child(
                Button::new("settings-back")
                    .label(self.text("Back to store", "返回商店"))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.settings_open = false;
                        cx.notify();
                    })),
            )
            .child(
                div()
                    .text_3xl()
                    .font_weight(FontWeight::BOLD)
                    .child(self.text("Settings", "设置")),
            )
            .child(
                div()
                    .text_color(rgb(MUTED))
                    .child(self.text("Configure local display preferences.", "配置本地显示偏好。")),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(self.text("Language", "语言")),
                    )
                    .child(
                        Button::new("settings-language")
                            .label(if self.chinese { "中文" } else { "English" })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.chinese = !this.chinese;
                                gpui_kit::component::set_locale(if this.chinese {
                                    "zh-CN"
                                } else {
                                    "en"
                                });
                                cx.notify();
                            })),
                    ),
            )
            .into_any_element()
    }
}

impl Render for Desktop {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let selected_id = self.selected.as_ref().map(|target| target.item_id.as_str());
        let results = self
            .results
            .iter()
            .enumerate()
            .map(|(index, item)| {
                let target = StoreTarget::new(&item.item_id, &item.package_name, &item.name).ok();
                let selected = selected_id == Some(item.item_id.as_str());
                div()
                    .id(("app", index))
                    .p_4()
                    .rounded_lg()
                    .cursor_pointer()
                    .bg(rgb(if selected { 0xe7e1d6 } else { 0xf8f7f1 }))
                    .border_1()
                    .border_color(rgb(if selected { ACCENT } else { 0xe0e1d7 }))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_3()
                            .child(Self::media_panel(
                                item.cover_url.as_ref(),
                                &item.name,
                                Some(52.),
                                52.,
                            ))
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child(item.name.clone()),
                            ),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(target) = &target {
                            this.select(target.clone(), cx);
                        }
                    }))
            })
            .collect::<Vec<_>>();
        let mut detail = div()
            .id("detail")
            .flex()
            .flex_col()
            .gap_5()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .overflow_y_scroll();
        if let Some(target) = &self.selected {
            if let Some(item) = &self.detail {
                detail = detail
                    .child(Self::media_panel(
                        item.cover_url.as_ref().or(item.icon_url.as_ref()),
                        &item.name,
                        None,
                        230.,
                    ))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_4()
                            .child(Self::media_panel(
                                item.icon_url.as_ref(),
                                &item.name,
                                Some(76.),
                                76.,
                            ))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .child(
                                        div()
                                            .text_3xl()
                                            .font_weight(FontWeight::BOLD)
                                            .child(item.name.clone()),
                                    )
                                    .child(
                                        div().text_color(rgb(MUTED)).child(item.publisher.clone()),
                                    ),
                            ),
                    );
                let free = item.price.parse::<f64>().is_ok_and(|price| price == 0.0);
                let owned = item.entitlement_status == Some(1);
                let unavailable = item.offer_exists == Some(false) && !owned;
                let price = if owned {
                    self.text("In your library", "已在你的应用库中").to_owned()
                } else if free {
                    self.text("Free", "免费").to_owned()
                } else {
                    format!("{} {}", item.price, item.currency)
                };
                detail = detail
                    .child(div().text_lg().child(item.summary.clone()))
                    .child(
                        div()
                            .text_sm()
                            .text_color(rgb(MUTED))
                            .child(item.genres.clone()),
                    )
                    .child(div().text_color(rgb(MUTED)).child(price))
                    .child(div().text_sm().child(format!(
                        "{} {}",
                        self.text("Version", "版本"),
                        if item.app_version.is_empty() {
                            item.version_code.to_string()
                        } else {
                            item.app_version.clone()
                        }
                    )));
                let official_url = item.official_url.clone();
                if self.account.is_none() {
                    detail = detail.child(div().child(
                        self.text("Sign in to download this app.", "登录后即可下载此应用。"),
                    ));
                } else if unavailable {
                    detail = detail.child(div().child(self.text(
                        "This app is unavailable for your account region.",
                        "你的账号所在地区暂时无法获取此应用。",
                    )));
                } else if !free && !owned {
                    detail = detail.child(div().child(self.text(
                        "Get this app from the PICO Store first, then refresh here.",
                        "请先在 PICO 商店购买此应用，再回到这里刷新。",
                    )));
                } else {
                    detail = detail.child(
                        Button::new("download")
                            .primary()
                            .label(if free && !owned {
                                self.text("Get & download APK", "领取并下载 APK")
                            } else {
                                self.text("Download APK", "下载 APK")
                            })
                            .disabled(self.busy)
                            .on_click(cx.listener(|this, _, _, cx| this.download(cx))),
                    );
                }
                if !item.description.is_empty() {
                    detail = detail.child(
                        div()
                            .mt_4()
                            .text_sm()
                            .text_color(rgb(MUTED))
                            .child(item.description.clone()),
                    );
                }
                if !item.screenshots.is_empty() {
                    detail = detail.child(div().flex().gap_3().children(
                        item.screenshots.iter().enumerate().map(|(index, url)| {
                            Self::media_panel(
                                Some(url),
                                &format!("Screenshot {}", index + 1),
                                Some(220.),
                                124.,
                            )
                        }),
                    ));
                }
                detail = detail.child(
                    Button::new("official-store")
                        .label(self.text("View in PICO Store ↗", "在 PICO 商店查看 ↗"))
                        .on_click(move |_, _, cx| cx.open_url(&official_url)),
                );
            }
            if self.detail.is_none() {
                detail = detail.child(
                    div()
                        .text_3xl()
                        .font_weight(FontWeight::BOLD)
                        .child(target.name.clone()),
                );
            }
            detail = detail.child(
                Button::new("refresh")
                    .label(self.text("Refresh", "刷新"))
                    .disabled(self.busy)
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(target) = this.selected.clone() {
                            this.select(target, cx);
                        }
                    })),
            );
            if let Some(path) = &self.downloaded {
                let path = path.clone();
                detail = detail.child(
                    Button::new("show-file")
                        .label(self.text("Show downloaded file", "显示下载的文件"))
                        .on_click(move |_, _, cx| cx.reveal_path(&path)),
                );
            }
        } else {
            detail = detail.child(div().text_3xl().font_weight(FontWeight::BOLD).child(self.text("Your next PICO app.", "找到你的下一个 PICO 应用。")))
                .child(div().text_color(rgb(MUTED)).child(self.text("Search or choose an app on the left. Download its APK to install on your headset.", "搜索或从左侧选择应用，下载 APK 后即可安装到头显。")));
        }
        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(rgb(PAPER))
            .text_color(rgb(INK))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_6()
                    .py_4()
                    .border_b_1()
                    .border_color(rgb(0xd4d6cb))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_3()
                            .child(
                                div()
                                    .text_3xl()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(rgb(ACCENT))
                                    .child("P/"),
                            )
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child("PICO STORE LAB"),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .gap_2()
                            .child(
                                Button::new("updates")
                                    .label(if let Some(version) = &self.available_update {
                                        format!("{} v{} ↗", self.text("Download update", "下载更新"), version)
                                    } else { format!("v{} · {}", env!("CARGO_PKG_VERSION"), self.text("Check for updates", "检查更新")) })
                                    .disabled(self.busy)
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        if this.available_update.is_some() { cx.open_url(&ProjectLinks::load().latest_release()); }
                                        else { this.check_updates(cx); }
                                    })),
                            )
                            .child(
                                Button::new("website")
                                    .label(self.text("Website ↗", "网站 ↗"))
                                    .on_click(|_, _, cx| cx.open_url(&format!("{}/", ProjectLinks::load().website_origin.trim_end_matches('/')))),
                            )
                            .child(
                                Button::new("language")
                                    .label(self.text("中文", "EN"))
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.chinese = !this.chinese;
                                        gpui_kit::component::set_locale(if this.chinese {
                                            "zh-CN"
                                        } else {
                                            "en"
                                        });
                                        cx.notify();
                                    })),
                            )
                            .child(
                                Button::new("settings")
                                    .label(self.text("Settings", "设置"))
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.settings_open = !this.settings_open;
                                        cx.notify();
                                    })),
                            ),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_1()
                    .min_h_0()
                    .child(
                        div()
                            .w(px(285.))
                            .flex_shrink_0()
                            .flex()
                            .flex_col()
                            .gap_3()
                            .p_5()
                            .border_r_1()
                            .border_color(rgb(0xd4d6cb))
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child(self.text("Find an app", "查找应用")),
                            )
                            .child(Input::new(&self.search).disabled(self.busy))
                            .child(
                                Button::new("search")
                                    .primary()
                                    .label(self.text("Search", "搜索"))
                                    .disabled(self.busy)
                                    .on_click(cx.listener(|this, _, _, cx| this.search(false, cx))),
                            )
                            .child(
                                div()
                                    .id("results")
                                    .flex_1()
                                    .min_h_0()
                                    .overflow_y_scroll()
                                    .flex()
                                    .flex_col()
                                    .gap_2()
                                    .children(results)
                                    .when(self.next_id.is_some(), |element| {
                                        element.child(
                                            Button::new("more")
                                                .label(self.text("Load more", "加载更多"))
                                                .disabled(self.busy)
                                                .on_click(cx.listener(|this, _, _, cx| {
                                                    this.search(true, cx)
                                                })),
                                        )
                                    }),
                            ),
                    )
                    .child(
                        div()
                            .id("content")
                            .flex_1()
                            .min_w_0()
                            .min_h_0()
                            .p_6()
                            .flex()
                            .gap_6()
                            .when(!self.settings_open, |element| {
                                element
                                    .child(detail)
                                    .child(
                                        div()
                                            .id("account-panel")
                                            .w(px(310.))
                                            .flex_shrink_0()
                                            .min_h_0()
                                            .overflow_y_scroll()
                                            .child(self.account_panel(cx)),
                                    )
                            })
                            .when(self.settings_open, |element| element.child(self.settings_panel(cx))),
                    ),
            )
            .child(
                div()
                    .min_h(px(60.))
                    .px_6()
                    .py_3()
                    .border_t_1()
                    .border_color(rgb(0xd4d6cb))
                    .text_sm()
                    .text_color(rgb(if self.is_error { ACCENT } else { MUTED }))
                    .child(self.message.text(self.chinese)),
            )
    }
}

fn main() {
    gpui_kit::application()
        .with_assets(gpui_kit::assets::Assets)
        .run(|cx| {
            gpui_kit::init(cx);
            Theme::change(ThemeMode::Light, None, cx);
            let theme = Theme::global_mut(cx);
            theme.colors.primary = rgb(ACCENT).into();
            theme.colors.primary_foreground = rgb(0xffffff).into();
            theme.font_size = px(15.);
            cx.on_window_closed(|cx, _| {
                if cx.windows().is_empty() {
                    cx.quit();
                }
            })
            .detach();
            let bounds = Bounds::centered(None, size(px(1120.), px(760.)), cx);
            cx.spawn(async move |cx| {
                cx.open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(bounds)),
                        window_min_size: Some(size(px(960.), px(620.))),
                        titlebar: Some(TitlebarOptions {
                            title: Some("PICO Store Lab".into()),
                            ..Default::default()
                        }),
                        app_id: Some("dev.nkanf.picostore.desktop".into()),
                        ..Default::default()
                    },
                    |window, cx| {
                        cx.activate(true);
                        let view = cx.new(|cx| Desktop::new(window, cx));
                        cx.new(|cx| Root::new(view, window, cx))
                    },
                )
                .expect("Could not open PICO Store Lab");
            })
            .detach();
        });
}
