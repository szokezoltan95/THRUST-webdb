import { FormEvent, useEffect, useState } from "react";

type PublicMetrics = {
  participant_count: number | null;
  measurement_count: number | null;
  minimum_group_size: number;
  publishable: boolean;
};

type User = { username: string; role: string; csrf_token: string };
type Overview = { participant_count: number; measurement_count: number };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  if (!response.ok) throw new Error(response.status === 401 ? "Nesprávne prihlasovacie údaje." : "Požiadavku sa nepodarilo dokončiť.");
  return response.status === 204 ? (undefined as T) : response.json();
}

export function App() {
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    request<PublicMetrics>("/api/public/metrics").then(setMetrics).catch(() => setMetrics(null));
    request<User>("/api/auth/me").then(setUser).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user) request<Overview>("/api/admin/overview").then(setOverview).catch(() => setOverview(null));
  }, [user]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const signedIn = await request<User>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
      });
      setUser(signedIn);
      setLoginOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prihlásenie zlyhalo.");
    }
  }

  async function logout() {
    if (!user) return;
    await request<void>("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": user.csrf_token } });
    setUser(null);
    setOverview(null);
  }

  return (
    <main>
      <header>
        <div className="brand"><span className="mark">T</span><div><strong>THRUST</strong><small>UAV Human Performance Research</small></div></div>
        {user ? <button className="quiet" onClick={logout}>Odhlásiť {user.username}</button> : <button className="quiet" onClick={() => setLoginOpen(true)}>Administrácia</button>}
      </header>

      {user ? (
        <section className="workspace">
          <div className="eyebrow">ADMINISTRÁCIA · {user.role.toUpperCase()}</div>
          <h1>Prehľad meraní</h1>
          <div className="stats">
            <Metric label="Účastníci" value={overview?.participant_count ?? "—"} />
            <Metric label="Merania" value={overview?.measurement_count ?? "—"} />
            <Metric label="Čakajúce synchronizácie" value="0" />
          </div>
          <div className="empty"><span>01</span><div><h2>Databáza je pripravená</h2><p>Ďalším krokom bude vytvorenie účastníkov a príjem prvého merania zo SCoPE.</p></div></div>
        </section>
      ) : (
        <section className="public">
          <div className="eyebrow">TESTING HUB FOR RESEARCH IN UAV SIMULATION AND TRAINING</div>
          <h1>Merateľný pohľad na výkon pilotov UAV.</h1>
          <p className="lead">THRUST spája štandardizované experimenty, lokálne analytické modely a anonymizované skupinové výsledky.</p>
          <div className="stats">
            <Metric label="Účastníci" value={metrics?.participant_count ?? "—"} />
            <Metric label="Merania" value={metrics?.measurement_count ?? "—"} />
            <Metric label="Aktívne testy" value="SCoPE" />
          </div>
          {metrics && !metrics.publishable && <p className="privacy">Verejné štatistiky sa zobrazia po dosiahnutí minimálnej skupiny {metrics.minimum_group_size} účastníkov.</p>}
        </section>
      )}

      {loginOpen && <div className="backdrop" onMouseDown={() => setLoginOpen(false)}><form className="login" onSubmit={login} onMouseDown={(e) => e.stopPropagation()}><div className="eyebrow">CHRÁNENÝ PRÍSTUP</div><h2>Administrácia</h2><label>Používateľské meno<input name="username" autoComplete="username" required autoFocus /></label><label>Heslo<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="error">{error}</p>}<div className="actions"><button type="button" className="quiet" onClick={() => setLoginOpen(false)}>Zrušiť</button><button type="submit" className="primary">Prihlásiť</button></div></form></div>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

