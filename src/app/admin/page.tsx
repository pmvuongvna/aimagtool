"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type AdminPayload = {
  settings: {
    creditPackages: Array<{ id: string; name: string; credits: number; priceVnd: number; badge?: string; active: boolean }>;
    imageCredits: { "1k": number; "2k": number; "4k": number };
    videoCredits: { "480p": number; "720p": number };
    grokVideoCreditsPerSecond: { "480p": number; "720p": number };
    imageEditExtraCost: number;
    defaultUserCredits: number;
  };
};

export default function AdminPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AdminPayload["settings"] | null>(null);
  const [userId, setUserId] = useState("demo-user");
  const [credits, setCredits] = useState(500);
  const [packageJson, setPackageJson] = useState("[]");
  const [status, setStatus] = useState("Loading settings...");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/settings");
      const payload = (await res.json()) as { settings?: AdminPayload["settings"]; error?: string };
      if (!res.ok || !payload.settings) {
        setStatus(payload.error || "Cannot load settings");
        return;
      }
      setSettings(payload.settings);
      setPackageJson(JSON.stringify(payload.settings.creditPackages || [], null, 2));
      setStatus("Ready");
    }
    void load();
  }, []);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setStatus("Saving settings...");
    let creditPackages = settings.creditPackages;
    try {
      const parsed = JSON.parse(packageJson) as AdminPayload["settings"]["creditPackages"];
      if (Array.isArray(parsed)) creditPackages = parsed;
    } catch {
      setStatus("Credit packages JSON không hợp lệ.");
      return;
    }
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { ...settings, creditPackages } }),
    });
    setStatus(res.ok ? "Settings saved" : "Save failed");
  }

  async function updateUserCredits(e: FormEvent) {
    e.preventDefault();
    setStatus("Updating credits...");
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCredit: { userId, credits } }),
    });
    setStatus(res.ok ? "User credits updated" : "Update failed");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!settings) {
    return (
      <main className="admin-v2">
        <h1>Admin Console</h1>
        <p>{status}</p>
      </main>
    );
  }

  const imageCostTotal = settings.imageCredits["1k"] + settings.imageCredits["2k"] + settings.imageCredits["4k"];
  const videoCostTotal = settings.videoCredits["480p"] + settings.videoCredits["720p"];

  return (
    <main className="admin-v2">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">Control Plane</p>
          <h1>Admin Console</h1>
          <p className="admin-status">{status}</p>
        </div>
        <div className="admin-header-actions">
          <Link href="/user" className="chip-btn dark">Open Studio</Link>
          <Link href="/" className="chip-btn ghost">Landing</Link>
          <button type="button" className="chip-btn dark" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <section className="admin-metrics">
        <article>
          <p>Image Cost Pool</p>
          <h3>{imageCostTotal}</h3>
        </article>
        <article>
          <p>Default Video Cost Pool (Veo3)</p>
          <h3>{videoCostTotal}</h3>
        </article>
        <article>
          <p>Grok Rate / sec</p>
          <h3>{settings.grokVideoCreditsPerSecond["480p"]} / {settings.grokVideoCreditsPerSecond["720p"]}</h3>
        </article>
        <article>
          <p>Default User Credits</p>
          <h3>{settings.defaultUserCredits}</h3>
        </article>
        <article>
          <p>Credit Packages</p>
          <h3>{settings.creditPackages.length}</h3>
        </article>
      </section>

      <section className="admin-grid">
        <form className="admin-card" onSubmit={saveSettings}>
          <h2>Credit Matrix</h2>
          <p className="admin-hint">Grok video uses per-second rates. Default video costs are reserved for Veo3.</p>

          <div className="admin-subgrid">
            <label>Image 1K
              <input type="number" value={settings.imageCredits["1k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "1k": Number(e.target.value) } })} />
            </label>
            <label>Image 2K
              <input type="number" value={settings.imageCredits["2k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "2k": Number(e.target.value) } })} />
            </label>
            <label>Image 4K
              <input type="number" value={settings.imageCredits["4k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "4k": Number(e.target.value) } })} />
            </label>
          </div>

          <div className="admin-subgrid">
            <label>Video 480p
              <input type="number" value={settings.videoCredits["480p"]} onChange={(e) => setSettings({ ...settings, videoCredits: { ...settings.videoCredits, "480p": Number(e.target.value) } })} />
            </label>
            <label>Video 720p
              <input type="number" value={settings.videoCredits["720p"]} onChange={(e) => setSettings({ ...settings, videoCredits: { ...settings.videoCredits, "720p": Number(e.target.value) } })} />
            </label>
            <label>Image Edit Extra
              <input type="number" value={settings.imageEditExtraCost} onChange={(e) => setSettings({ ...settings, imageEditExtraCost: Number(e.target.value) })} />
            </label>
          </div>

          <div className="admin-subgrid">
            <label>Grok 480p (credit/sec)
              <input type="number" step="0.1" value={settings.grokVideoCreditsPerSecond["480p"]} onChange={(e) => setSettings({ ...settings, grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond, "480p": Number(e.target.value) } })} />
            </label>
            <label>Grok 720p (credit/sec)
              <input type="number" step="0.1" value={settings.grokVideoCreditsPerSecond["720p"]} onChange={(e) => setSettings({ ...settings, grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond, "720p": Number(e.target.value) } })} />
            </label>
            <div />
          </div>

          <label>Default User Credits
            <input type="number" value={settings.defaultUserCredits} onChange={(e) => setSettings({ ...settings, defaultUserCredits: Number(e.target.value) })} />
          </label>

          <label>Credit Packages (JSON)
            <textarea
              rows={10}
              value={packageJson}
              onChange={(e) => setPackageJson(e.target.value)}
              placeholder='[{"id":"starter","name":"Starter","credits":500,"priceVnd":99000,"badge":"Phổ biến","active":true}]'
            />
          </label>

          <button className="generate-cta">Save Credit Settings</button>
        </form>

        <form className="admin-card" onSubmit={updateUserCredits}>
          <h2>User Credits</h2>
          <p className="admin-hint">Manually top-up or reset any user account.</p>

          <label>User ID
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <label>Credits
            <input type="number" value={credits} onChange={(e) => setCredits(Number(e.target.value))} />
          </label>
          <button className="generate-cta">Update User Credits</button>
        </form>
      </section>
    </main>
  );
}
