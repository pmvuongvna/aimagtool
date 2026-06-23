"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiFetch, apiPath } from "@/lib/api-url";
import styles from "../auth.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function waitForSession() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await apiFetch(apiPath("/api/auth/me"), { cache: "no-store" });
      if (res.ok) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(apiPath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; user?: { role?: "user" | "admin" } };
      if (!res.ok) {
        setError(payload.error || "Login failed.");
        return;
      }
      await waitForSession();
      window.location.assign(payload.user?.role === "admin" ? "/admin" : "/user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.authCard}>
        <h1>Đăng nhập</h1>
        <p>Truy cập AIStudio để tạo ảnh và video bằng AI.</p>

        <form className={styles.authForm} onSubmit={onSubmit}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label>
            Mật khẩu
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.submitBtn} disabled={loading}>{loading ? "Đang đăng nhập..." : "Đăng nhập"}</button>
        </form>

        <p className={styles.meta}>
          Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
        </p>
      </section>
    </main>
  );
}
