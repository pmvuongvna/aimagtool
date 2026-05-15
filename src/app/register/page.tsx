"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch, apiPath } from "@/lib/api-url";
import styles from "../auth.module.css";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(apiPath("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Register failed.");
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
        <h1>Tạo tài khoản</h1>
        <p>Đăng ký AIStudio để bắt đầu tạo nội dung AI.</p>

        <form className={styles.authForm} onSubmit={onSubmit}>
          <label>
            Họ tên
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Minh Anh" />
          </label>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label>
            Mật khẩu
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.submitBtn} disabled={loading}>{loading ? "Đang tạo..." : "Đăng ký"}</button>
        </form>

        <p className={styles.meta}>
          Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
        </p>
      </section>
    </main>
  );
}

