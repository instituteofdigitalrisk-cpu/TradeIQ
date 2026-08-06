import { useState } from "react";

type Props = {
  onLogin: (email: string, password: string) => Promise<void>;
};

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-name">TradeIQ</div>
            <div className="brand-sub">Admin Portal</div>
          </div>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="admin@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="notice" style={{ marginTop: 16 }}>
          Only accounts with the <code>admin</code> role can sign in here.
        </p>
      </div>
    </div>
  );
}
