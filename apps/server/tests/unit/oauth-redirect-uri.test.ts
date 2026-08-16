import { describe, expect, test } from "bun:test";
import { isValidRedirectUri } from "../../src/oauth/register";

describe("oauth redirect_uri validation", () => {
	test("http on a host whose DNS name merely starts with a private prefix is rejected", () => {
		// The private-network range checks must apply to actual IP literals
		// only - these resolve on the public internet, so http is not allowed.
		for (const uri of [
			"http://10.evil.com/cb",
			"http://10.0.0.1.evil.com/cb",
			"http://192.168.evil.com/cb",
			"http://172.16.evil.com/cb",
			"http://169.254.evil.com/cb",
			"http://fca.example.com/cb",
			"http://fe8b.example.com/cb",
			"http://fd00.example.com/cb",
		]) {
			expect(isValidRedirectUri(uri)).toBe(false);
		}
	});

	test("http on RFC1918 and link-local IPv4 literals is accepted", () => {
		for (const uri of [
			"http://10.0.0.5:8080/cb",
			"http://172.16.0.8:8080/cb",
			"http://172.31.255.1:8080/cb",
			"http://192.168.1.50:8080/cb",
			"http://169.254.10.1:8080/cb",
		]) {
			expect(isValidRedirectUri(uri)).toBe(true);
		}
	});

	test("http on public IPv4 literals is rejected (including the 172.32+ top of the 172/12 window)", () => {
		for (const uri of [
			"http://8.8.8.8/cb",
			"http://172.32.0.1/cb",
			"http://198.51.100.7/cb",
		]) {
			expect(isValidRedirectUri(uri)).toBe(false);
		}
	});

	test("http on ULA and link-local IPv6 literals is accepted, and the range checks use the real address bits", () => {
		expect(isValidRedirectUri("http://[fd00::1]:8080/cb")).toBe(true);
		expect(isValidRedirectUri("http://[fe80::1]:8080/cb")).toBe(true);
		// 0fe8::1 expands to 0x0fe8 hextet 0 - NOT fe80::/10, and fd::2 expands
		// to 0x00fd - NOT fc00::/7. Leading-zero stripping makes these look
		// like private prefixes, so rejecting them pins the bit-exact checks.
		expect(isValidRedirectUri("http://[0fe8::1]/cb")).toBe(false);
		expect(isValidRedirectUri("http://[fd::2]/cb")).toBe(false);
	});

	test("IPv4-mapped IPv6 is judged by its embedded IPv4 address", () => {
		expect(isValidRedirectUri("http://[::ffff:192.168.1.1]/cb")).toBe(true);
		expect(isValidRedirectUri("http://[::ffff:8.8.8.8]/cb")).toBe(false);
	});

	test("loopback http, mDNS names, https, and native-app custom schemes keep working", () => {
		for (const uri of [
			"http://localhost:9999/cb",
			"http://127.0.0.1:8080/cb",
			"http://[::1]:3000/cb",
			"http://mybox.local:8080/cb",
			"https://example.com/cb",
			"https://example.com:8443/cb",
			"cursor://oauth/callback",
			"vscode://oauth/callback",
		]) {
			expect(isValidRedirectUri(uri)).toBe(true);
		}
	});

	test("scriptable schemes and userinfo in http(s) are still rejected", () => {
		for (const uri of [
			"javascript:alert(1)",
			"data:text/html,hi",
			"vbscript:msgbox(1)",
			"file:///etc/passwd",
			"about:blank",
			"http://example.com@localhost/cb",
			"https://attacker.com@victim.com/cb",
			"notaurl",
		]) {
			expect(isValidRedirectUri(uri)).toBe(false);
		}
	});
});
