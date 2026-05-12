"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import styles from "../auth.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Login failed.");
        return;
      }
      router.push("/user");
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
        <p className={styles.demo}>Admin demo: admin@aistudio.local / admin123</p>
      </section>
    </main>
  );
}
