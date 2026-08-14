import { useEffect, useState } from "react";
import { admin } from "../api";
import type { Setting } from "../types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await admin.listSettings({ page: 1, per_page: 1000 });
      const map: Record<string, string> = {};
      (res.settings || []).forEach((s: Setting) => {
        map[s.key] = s.value ?? "";
      });
      setSettings(map);
      setKeys(Object.keys(map));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveAll = async () => {
    try {
      await admin.putSettings(settings);
      await load();
      alert("Settings saved");
    } catch (err) {
      console.error(err);
      alert("Failed to save settings");
    }
  };

  const addNew = () => {
    if (!newKey) return;
    setSettings((s) => ({ ...s, [newKey]: newValue }));
    setKeys((k) => Array.from(new Set([...k, newKey])));
    setNewKey("");
    setNewValue("");
  };

  return (
    <div>
      <h2>Settings</h2>
      {loading ? (
        <span className="spinner" />
      ) : (
        <div>
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <input placeholder="New key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
            <input placeholder="New value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
            <button onClick={addNew}>Add</button>
            <div style={{ marginLeft: 8 }}>
              <button className="primary" onClick={saveAll}>Save All</button>
            </div>
          </div>

          <table>
            <thead>
              <tr><th>Key</th><th>Value</th></tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td style={{ width: 300 }}>{k}</td>
                  <td>
                    <input style={{ width: "100%" }} value={settings[k] ?? ""} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
