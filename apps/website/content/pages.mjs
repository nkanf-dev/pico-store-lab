const registerUrl = 'https://sso-global.picoxr.com/';
const releasesUrl = 'https://github.com/nkanf-dev/pico-store-lab/releases/latest';
const repositoryUrl = 'https://github.com/nkanf-dev/pico-store-lab';

export const apps = [
  {
    slug: 'vrchat',
    itemId: '7288745304105664518',
    packageName: 'com.vrchat.android',
    name: 'VRChat',
    officialUrl: 'https://store-global.picoxr.com/global/detail/1/7288745304105664518',
    publisher: 'VRChat',
    sources: [
      { label: 'VRChat · PICO Store', url: 'https://store-global.picoxr.com/global/detail/1/7288745304105664518' },
      { label: 'VRChat · Getting started', url: 'https://wiki.vrchat.com/wiki/Getting_Started' },
    ],
    zh: {
      summary: '下载 VRChat 的 PICO 版本，在头显上和朋友见面、逛地图。国区商店搜不到时，可以在这里用 PICO 国际区账号获取安装包。',
      description: 'VRChat 里有玩家制作的世界和虚拟形象。你可以找朋友聊天、玩小游戏，也可以加入活动，认识新朋友。这里提供 PICO 一体机版本的下载入口；安装到支持的头显后，可以直接运行，无需电脑串流。',
      platforms: ['PICO 4', 'PICO 4 Pro', 'PICO 4 Ultra'],
      steps: [
        { title: '准备 PICO 国际区账号', text: '下载时使用 PICO 国际区账号登录。还没有账号的话，在本页的下载区域点击“前往 PICO 官网注册”，打开后选择 Sign Up。' },
        { title: '领取并下载', text: '在本页填写邮箱，获取验证码并登录。首次获取时点击“领取免费应用”，然后选择“下载 APK”。' },
        { title: '安装到头显', text: '把下载好的 APK 传到头显，用 APK 安装器打开并确认安装。也可以使用 PICO Store Lab 的头显客户端直接下载、安装。' },
        { title: '打开 VRChat', text: '在头显应用库中找到 VRChat，按应用内提示登录。已有 VRChat 账号可以继续使用。' },
      ],
      faq: [
        { q: '国区 PICO 需要先转区吗？', a: '按这里的流程下载 PICO 版 APK，再安装到头显即可，不需要先给头显转区。下载时需要 PICO 国际区账号，应用本身仍有设备和网络要求。' },
        { q: '哪些 PICO 设备可以运行 VRChat？', a: 'VRChat 官方入门指南列出了 PICO 4、PICO 4 Pro 和 PICO 4 Ultra。安装前也可以查看下方的 PICO 商店页面，确认设备及系统要求。' },
        { q: '这是手机版还是一体机版？', a: '这是 PICO 一体机版本。VRChat 另有 Android 手机、Quest 和 PC 版本，给 PICO 头显安装时请选择 PICO 版。' },
        { q: 'VRChat 要付费吗？', a: 'VRChat 可以免费获取。首次下载前点“领取免费应用”，把它添加到你的 PICO 账号，再下载即可。' },
        { q: '登录下载后，还要登录 VRChat 吗？', a: '需要。PICO 国际区账号用于获取安装包；打开 VRChat 后，按照应用内提示登录你的 VRChat 账号或使用支持的平台登录方式。' },
        { q: '游戏提示版本过旧，怎么更新？', a: '回到本页重新获取下载信息，下载新版本后安装。也可以在 PICO Store Lab 头显客户端中再次下载。先尝试直接更新，遇到安装报错时记下完整提示。' },
      ],
    },
    en: {
      summary: 'Get the PICO version of VRChat to meet friends and explore worlds on your headset. Download with your PICO international account.',
      description: 'VRChat is a place to meet people, play games, and explore worlds made by its community. This page links to the standalone PICO version, which runs on a supported headset without streaming from a computer.',
      platforms: ['PICO 4', 'PICO 4 Pro', 'PICO 4 Ultra'],
      steps: [
        { title: 'Prepare your PICO account', text: 'Use a PICO international account to download. If you do not have one, choose Register on PICO’s website in the download section, then Sign Up.' },
        { title: 'Get the app and download', text: 'Enter your email on this page and sign in with the email code. Choose Get free app if you have not added VRChat to your account, then Download APK.' },
        { title: 'Install on your headset', text: 'Transfer the APK to your headset and open it with an APK installer. You can also download and install through the PICO Store Lab Android app on your headset.' },
        { title: 'Open VRChat', text: 'Find VRChat in your headset library and follow its sign-in instructions. You can use your existing VRChat account.' },
      ],
      faq: [
        { q: 'Do I need to change my headset region?', a: 'This download-and-install method does not require changing your headset region. It uses a PICO international account to get the APK. The app still has its own device and network requirements.' },
        { q: 'Which PICO headsets support VRChat?', a: 'The official VRChat getting-started guide lists PICO 4, PICO 4 Pro, and PICO 4 Ultra. Check the linked PICO Store page for device and system requirements before installing.' },
        { q: 'Is this the phone app or the headset app?', a: 'This is the standalone PICO headset version. VRChat also has Android phone, Quest, and PC versions; choose the PICO version for your PICO headset.' },
        { q: 'Is VRChat free?', a: 'VRChat is free to get. Choose Get free app to add it to your PICO account before your first download.' },
        { q: 'Do I need to sign in again inside VRChat?', a: 'Yes. Your PICO international account is used to get the APK. Once you open VRChat, sign in with your VRChat account or an available platform sign-in option.' },
        { q: 'How do I update an old version?', a: 'Return to this page for current download information, then download and install the new version. You can also download it again in the PICO Store Lab headset app. Try updating the existing installation first and keep any error message if installation fails.' },
      ],
    },
  },
  {
    slug: 'youtube-vr',
    itemId: '7270207384512020485',
    packageName: 'com.google.android.apps.youtube.vr.pico',
    name: 'YouTube VR',
    officialUrl: 'https://store-global.picoxr.com/global/detail/1/7270207384512020485',
    publisher: 'Google LLC',
    sources: [
      { label: 'YouTube VR · PICO Store', url: 'https://store-global.picoxr.com/global/detail/1/7270207384512020485' },
      { label: 'YouTube VR · Help', url: 'https://support.google.com/youtube/answer/7205134' },
    ],
    zh: {
      summary: '在 PICO 头显里观看 YouTube 视频和全景内容。这里是 YouTube VR 的 PICO 版本下载入口。',
      description: 'YouTube VR 可以在头显里播放普通视频和全景视频。登录 Google 账号后，可以查看自己的订阅和播放列表。如果国区商店里搜不到，可以用 PICO 国际区账号下载这个版本，再安装到头显。',
      platforms: ['PICO 4', 'PICO 4 Ultra'],
      steps: [
        { title: '登录 PICO 国际区账号', text: '在本页的下载区域填写邮箱，通过邮件验证码登录。还没有国际区账号，可以先点击“前往 PICO 官网注册”。' },
        { title: '下载 YouTube VR', text: '首次获取时先点击“领取免费应用”，然后下载 APK。本页对应 PICO 头显版本。' },
        { title: '在头显里安装', text: '把 APK 传到头显，用 APK 安装器打开并确认安装。也可以在 PICO Store Lab 头显客户端中搜索 YouTube VR 后下载、安装。' },
        { title: '打开应用观看', text: '打开 YouTube VR，按屏幕提示操作。需要查看订阅或播放列表时，按应用提示在手机或电脑上登录 Google 账号。' },
      ],
      faq: [
        { q: '国区 PICO 可以用这条方法安装吗？', a: '可以通过这里获取 PICO 版 APK，再安装到头显，不需要先给头显转区。下载需要 PICO 国际区账号；观看时还需要能够连接 YouTube 服务的网络。' },
        { q: '应该下载哪个版本的 YouTube？', a: '给 PICO 头显安装时，选择本页的 YouTube VR PICO 版。手机上的 YouTube 和其他头显平台的版本不能直接当作 PICO 版使用。' },
        { q: '支持哪些设备？', a: 'PICO 商店列出的设备包括 PICO 4 和 PICO 4 Ultra。其他设备请先查看下方的官方商店页面。' },
        { q: 'PICO 账号和 Google 账号各用在什么地方？', a: 'PICO 国际区账号用来领取、下载应用。Google 账号用于 YouTube VR 内的订阅、播放列表等功能；按应用显示的步骤登录即可。' },
        { q: '安装后一直加载，怎么办？', a: '先确认下载的是 PICO 版本，再检查头显的网络能否连接 YouTube 服务。记下卡住的画面或错误提示，查看 YouTube 帮助里的对应说明。' },
        { q: '可以选到多高的清晰度？', a: '实际可选清晰度取决于视频、设备、应用版本和网络。在播放设置中查看当前视频提供的选项。' },
      ],
    },
    en: {
      summary: 'Watch YouTube videos and 360° content on your PICO headset. Download the PICO version of YouTube VR here.',
      description: 'YouTube VR brings regular and 360° videos to your headset. Sign in with your Google account to find your subscriptions and playlists. Use your PICO international account to download the PICO version, then install it on your headset.',
      platforms: ['PICO 4', 'PICO 4 Ultra'],
      steps: [
        { title: 'Sign in to your PICO account', text: 'Enter your email in the download section and sign in with the email code. If you need a PICO international account, choose Register on PICO’s website first.' },
        { title: 'Download YouTube VR', text: 'Choose Get free app if you have not added it to your account, then download the APK. This page is for the PICO headset version.' },
        { title: 'Install on your headset', text: 'Transfer the APK to your headset and open it with an APK installer. You can also search for YouTube VR in the PICO Store Lab headset app to download and install it there.' },
        { title: 'Open YouTube VR', text: 'Follow the instructions in the app. To access subscriptions and playlists, sign in to your Google account on a phone or computer when prompted.' },
      ],
      faq: [
        { q: 'Does this method require changing my headset region?', a: 'No. Download the PICO APK here and install it on your headset. You need a PICO international account to download, and a network that can connect to YouTube to watch videos.' },
        { q: 'Which YouTube version should I install?', a: 'Choose the YouTube VR PICO version on this page. The phone app and versions for other headset platforms are not substitutes for the PICO version.' },
        { q: 'Which headsets are supported?', a: 'The PICO Store lists PICO 4 and PICO 4 Ultra among the supported devices. For other models, check the official store page linked below.' },
        { q: 'Where do I use my PICO and Google accounts?', a: 'Your PICO international account is used to get and download the app. Your Google account gives you access to subscriptions and playlists inside YouTube VR; follow the instructions shown in the app.' },
        { q: 'What if the app gets stuck loading?', a: 'Check that you installed the PICO version, then check whether your headset network can connect to YouTube. Note the screen or error message and look for the relevant instructions in YouTube Help.' },
        { q: 'What video resolution can I use?', a: 'Available quality options depend on the video, device, app version, and network. Check the playback settings for the video you are watching.' },
      ],
    },
  },
];

export const guide = {
  zh: {
    title: '国区 PICO 不转区，怎么下载国际区应用？',
    description: '用 PICO 国际区账号下载 VRChat、YouTube VR 等应用的 PICO 版 APK，再安装到头显。从注册账号到安装，按步骤完成。',
    sections: [
      {
        id: 'before-you-start',
        title: '先选好要安装的应用',
        paragraphs: ['如果你在国区商店搜不到 VRChat 或 YouTube VR，可以先下载它的 PICO 版安装包，再安装到头显。这条流程不需要给头显刷国际版固件。', '下载前看一下应用页的适用设备。下载用的 PICO 国际区账号、头显所在地区，以及应用内的账号是几件不同的事：领取安装包后，VRChat 和 YouTube 仍按各自的方式登录使用。'],
        steps: [],
        links: [
          { label: '下载 VRChat PICO 版', url: '/apps/vrchat/' },
          { label: '下载 YouTube VR PICO 版', url: '/apps/youtube-vr/' },
        ],
      },
      {
        id: 'register',
        title: '准备一个 PICO 国际区账号',
        paragraphs: ['已经有国际区账号，可以直接去下载。只有国区账号的话，先到 PICO 国际账号页面注册，使用你能收取邮件的邮箱。'],
        steps: [
          { title: '打开注册页面', text: '点击下方链接，选择 Sign Up。按照页面提示填写地区、生日和邮箱等信息。' },
          { title: '完成邮箱验证', text: '查收 PICO 发来的邮件，输入验证码，完成注册。' },
          { title: '回到应用页登录', text: '用刚注册的邮箱发送登录验证码。收到新的验证码后，在 PICO Store Lab 中填写并登录。' },
        ],
        links: [{ label: '前往 PICO 注册账号', url: registerUrl }],
      },
      {
        id: 'website',
        title: '在网页下载 APK',
        paragraphs: ['在电脑上打开应用页面，可以把安装包保存下来，再传到头显。'],
        steps: [
          { title: '打开应用', text: '从 VRChat、YouTube VR 页面进入，或在首页搜索应用名称，选择需要的 PICO 版本。' },
          { title: '使用邮箱验证码登录', text: '在下载区域输入 PICO 国际区账号邮箱，点击“发送验证码”，查收邮件后登录。' },
          { title: '领取应用', text: '尚未领取的免费应用，先点击“领取免费应用”。付费应用需要先在 PICO 商店购买。' },
          { title: '下载安装包', text: '点击“下载 APK”，等待浏览器完成下载。接下来把文件传到头显并安装。' },
        ],
        links: [{ label: '浏览应用', url: '/#catalog' }],
      },
      {
        id: 'headset-install',
        title: '把安装包安装到头显',
        paragraphs: ['如果头显已有 APK 安装器，把下载的文件传过去，打开并按系统提示安装即可。安装完成后，到应用库中找刚安装的应用；有些 PICO OS 版本会把侧载应用放在“未知来源”中。', '也可以先给头显安装 PICO Store Lab。之后直接在头显里搜索应用、登录和下载，下载完成后会进入安装流程。'],
        steps: [
          { title: '下载头显客户端', text: '在客户端下载页选择 Android APK，将 pico-store-android.apk 传到头显并安装。' },
          { title: '在头显打开 PICO Store Lab', text: '从应用库或“未知来源”打开，使用 PICO 国际区账号登录，搜索要安装的应用。' },
          { title: '下载并确认安装', text: '免费应用先获取，再下载。系统询问是否允许 PICO Store Lab 安装应用时，按提示允许，然后确认安装。' },
        ],
        links: [
          { label: '下载头显客户端', url: '/download/' },
          { label: '使用电脑和 ADB 安装', url: 'https://github.com/nkanf-dev/pico-store-lab/blob/main/README.zh-CN.md#2-在头显下载并安装' },
        ],
      },
      {
        id: 'update',
        title: '需要更新时',
        paragraphs: ['应用提示版本过旧时，回到对应的应用页获取新的下载信息，重新下载并安装。先尝试直接更新已有应用，避免因卸载而丢失本地设置。', 'PICO Store Lab 自己的更新，可以在桌面窗口或 Android 客户端的账号菜单中点击“检查更新”。'],
        steps: [],
        links: [{ label: '查看 PICO Store Lab 最新版本', url: releasesUrl }],
      },
      {
        id: 'troubleshoot',
        title: '卡在哪一步，可以先看这里',
        paragraphs: ['验证码没收到：确认用的是国际区账号的注册邮箱，再查看垃圾邮件。连续请求前，先等页面的倒计时结束。', '下载按钮提示需要获取应用：免费应用先点击领取；付费应用先在 PICO 商店购买，再回来下载。', '提示无法安装：确认选了 PICO 版本，检查剩余空间，并记下安装器的完整错误提示。不要急着卸载旧应用。', '装好后无法登录或一直加载：查看应用自己的账号和网络要求。YouTube VR 需要连接 YouTube 服务，VRChat 也需要连接自己的服务。'],
        steps: [],
        links: [
          { label: 'VRChat 官方入门帮助', url: 'https://wiki.vrchat.com/wiki/Getting_Started/zh-hans' },
          { label: 'YouTube VR 帮助', url: 'https://support.google.com/youtube/answer/7205134?hl=zh-Hans' },
          { label: '反馈 PICO Store Lab 的问题', url: `${repositoryUrl}/issues` },
        ],
      },
    ],
  },
  en: {
    title: 'Install international PICO apps without changing your headset region',
    description: 'Get the PICO APK for VRChat, YouTube VR, and other apps with your PICO international account, then install it on your headset.',
    sections: [
      {
        id: 'before-you-start',
        title: 'Choose the app you want',
        paragraphs: ['If VRChat or YouTube VR is missing from your headset store, you can download its PICO APK and install it yourself. This method does not require flashing international firmware.', 'Check the supported devices on the app page first. The PICO international account used to download, your headset region, and the account you use inside the app are separate things. Once installed, VRChat and YouTube follow their own sign-in process.'],
        steps: [],
        links: [
          { label: 'Get VRChat for PICO', url: '/en/apps/vrchat/' },
          { label: 'Get YouTube VR for PICO', url: '/en/apps/youtube-vr/' },
        ],
      },
      {
        id: 'register',
        title: 'Prepare a PICO international account',
        paragraphs: ['If you already have a PICO international account, continue to the download. Otherwise, register on PICO’s international account website with an email address you can access.'],
        steps: [
          { title: 'Open the registration page', text: 'Follow the link below and choose Sign Up. Complete the requested region, date of birth, and email fields.' },
          { title: 'Verify your email', text: 'Check your inbox for the PICO email and enter its code to complete registration.' },
          { title: 'Return to the app page', text: 'Request a sign-in code for the same email address, then enter that new code in PICO Store Lab.' },
        ],
        links: [{ label: 'Create a PICO account', url: registerUrl }],
      },
      {
        id: 'website',
        title: 'Download the APK from the website',
        paragraphs: ['Open the app page on your computer to save an APK, then transfer it to your headset.'],
        steps: [
          { title: 'Choose an app', text: 'Open the VRChat or YouTube VR page, or search from the homepage. Choose the PICO version you want.' },
          { title: 'Sign in with an email code', text: 'Enter your PICO international account email in the download section, choose Send code, and sign in with the code from your inbox.' },
          { title: 'Add the app to your account', text: 'Choose Get free app if you have not claimed a free app yet. Paid apps must first be purchased in PICO Store.' },
          { title: 'Save the APK', text: 'Choose Download APK and wait for your browser to finish. You can then transfer the file to your headset and install it.' },
        ],
        links: [{ label: 'Browse apps', url: '/en/#catalog' }],
      },
      {
        id: 'headset-install',
        title: 'Install on your headset',
        paragraphs: ['If your headset has an APK installer, transfer the downloaded file, open it, and follow the installation prompts. Find the installed app in your library; some PICO OS versions place sideloaded apps under Unknown Sources.', 'You can also install PICO Store Lab on your headset first. Then search, sign in, and download on the headset, and confirm the installation when the download finishes.'],
        steps: [
          { title: 'Get the headset app', text: 'Choose the Android APK on the downloads page, transfer pico-store-android.apk to your headset, and install it.' },
          { title: 'Open PICO Store Lab', text: 'Find it in your library or Unknown Sources, sign in with your PICO international account, and search for an app.' },
          { title: 'Download and install', text: 'Get a free app before downloading it. When the system asks, allow PICO Store Lab to install apps and confirm installation.' },
        ],
        links: [
          { label: 'Download the headset app', url: '/en/download/' },
          { label: 'Install from a computer with ADB', url: 'https://github.com/nkanf-dev/pico-store-lab#2-download-and-install-on-your-headset' },
        ],
      },
      {
        id: 'update',
        title: 'When an app needs an update',
        paragraphs: ['Return to the app page for current download information, then download and install the newer APK. Try updating the existing app first to avoid losing local settings through an uninstall.', 'For updates to PICO Store Lab itself, use Check for updates in the desktop window or the Android account menu.'],
        steps: [],
        links: [{ label: 'Latest PICO Store Lab release', url: releasesUrl }],
      },
      {
        id: 'troubleshoot',
        title: 'If you get stuck',
        paragraphs: ['No email code: check that you entered your PICO international account email and look in your spam folder. Wait for the countdown before requesting another code.', 'Asked to get the app first: claim a free app before downloading. Buy paid apps in PICO Store, then return to download.', 'Installation failed: check that you chose the PICO version and have enough free space. Keep the full error message from the installer before removing an existing app.', 'The app will not sign in or keeps loading: check its account and network requirements. YouTube VR needs a connection to YouTube, and VRChat needs access to its own service.'],
        steps: [],
        links: [
          { label: 'VRChat getting started', url: 'https://wiki.vrchat.com/wiki/Getting_Started' },
          { label: 'YouTube VR Help', url: 'https://support.google.com/youtube/answer/7205134?hl=en' },
          { label: 'Report a PICO Store Lab issue', url: `${repositoryUrl}/issues` },
        ],
      },
    ],
  },
};

export const about = {
  zh: {
    title: '关于 PICO Store Lab',
    description: 'PICO Store Lab 是一个开源的 PICO 应用下载工具，提供网页、头显和桌面客户端。',
    sections: [
      {
        id: 'project',
        title: '让想装的应用更好找',
        paragraphs: ['国区商店搜不到想用的应用，又不想折腾转区，PICO Store Lab 就是为这种情况做的。你可以在网页找到 VRChat、YouTube VR 等应用，用自己的 PICO 国际区账号下载，再安装到头显。', '经常下载应用的话，也可以使用头显客户端，或 Windows、macOS、Linux 桌面客户端。项目由 nkanf-dev 维护，代码公开在 GitHub。'],
        steps: [],
        links: [{ label: '查看 GitHub 项目', url: repositoryUrl }, { label: '选择客户端', url: '/download/' }],
      },
      {
        id: 'feedback',
        title: '遇到问题或有建议',
        paragraphs: ['欢迎在 GitHub 提交问题。描述你使用的设备、应用名称和卡住的步骤，附上错误提示，会更容易查清原因。', 'PICO Store Lab 是独立社区项目，与 PICO 无隶属关系。应用的介绍与设备信息可以通过各应用页的官方链接继续查看。'],
        steps: [],
        links: [{ label: '提交问题或建议', url: `${repositoryUrl}/issues` }],
      },
    ],
  },
  en: {
    title: 'About PICO Store Lab',
    description: 'PICO Store Lab is an open-source PICO app downloader with a website, headset app, and desktop apps.',
    sections: [
      {
        id: 'project',
        title: 'Find the apps you want to install',
        paragraphs: ['PICO Store Lab helps when an app is missing from your headset store and you do not want to change regions. Find apps such as VRChat and YouTube VR, download with your own PICO international account, and install them on your headset.', 'For regular downloads, use the headset app or a desktop app for Windows, macOS, or Linux. The project is maintained by nkanf-dev, with its source code available on GitHub.'],
        steps: [],
        links: [{ label: 'View the GitHub project', url: repositoryUrl }, { label: 'Choose a client', url: '/en/download/' }],
      },
      {
        id: 'feedback',
        title: 'Questions and feedback',
        paragraphs: ['Report a problem on GitHub with your device, the app name, and the step where you got stuck. Include the error message if there is one.', 'PICO Store Lab is an independent community project and is not affiliated with PICO. Each app page links to official information about the app and its supported devices.'],
        steps: [],
        links: [{ label: 'Report an issue or suggest a change', url: `${repositoryUrl}/issues` }],
      },
    ],
  },
};
