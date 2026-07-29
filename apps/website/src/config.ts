export const SITE_URL = "https://devicesdk.com";
export const SITE_LANGUAGE = "en-us";
export const SITE_TITLE =
	"DeviceSDK - Deploy TypeScript to ESP32 & Raspberry Pi Pico";
export const SITE_DESCRIPTION =
	"Free, open-source, self-hosted IoT platform. Write TypeScript device scripts, run the server on your own hardware (Raspberry Pi, NUC, NAS, Docker), and connect ESP32 & Pi Pico devices over WebSocket.";
export const DOCS_URL = "https://docs.devicesdk.com";
export const QUICKSTART_URL = `${DOCS_URL}/quickstart/`;
export const GITHUB_URL = "https://github.com/device-sdk/devicesdk";
export const DISCORD_URL = "https://discord.gg/WuNhbXGsBy";
export const TWITTER_URL = "https://x.com/devicesdk";

export interface MenuItem {
	name: string;
	url: string;
}

export const MAIN_MENU: MenuItem[] = [
	{ name: "Product", url: "/product/" },
	{ name: "Solutions", url: "/solutions/" },
	{ name: "Examples", url: "/examples/" },
	{ name: "Docs", url: DOCS_URL },
	{ name: "Community", url: "/community/" },
	{ name: "GitHub", url: GITHUB_URL },
];

export const FOOTER_PRODUCT: MenuItem[] = [
	{ name: "Documentation", url: DOCS_URL },
	{ name: "Quickstart", url: QUICKSTART_URL },
	{ name: "Examples", url: "/examples/" },
	{ name: "GitHub", url: GITHUB_URL },
];

export const FOOTER_COMPANY: MenuItem[] = [
	{ name: "About", url: "/about/" },
	{ name: "Changelog", url: `${DOCS_URL}/changelog/` },
];

export const FOOTER_COMMUNITY: MenuItem[] = [
	{ name: "GitHub", url: GITHUB_URL },
	{ name: "X", url: TWITTER_URL },
	{ name: "Discord", url: DISCORD_URL },
];

export const FOOTER_LEGAL: MenuItem[] = [
	{ name: "Terms of Service", url: "/terms/" },
	{ name: "Privacy Policy", url: "/privacy/" },
];
