import React, { useEffect, useState } from "react";
import { createPresenter, readPresenters, writePresenters } from "../lib/presenterLibrary";

const keys = ["front", "side", "back", "closeup"];
const label = { front: "Front reference", side: "Side reference", back: "Back reference", closeup: "Close-up reference" };

export default function CommercialPresenterLibrary() {
  const [people, setPeople] = useState([]);
  const [name, setName] = useState("");
  const [refs, setRefs] = useState({ front: "", side: "", back: "", closeup: "" });
  const [message, setMessage] = useState("");
  useEffect(() => { try { setPeople(readPresenters(window.localStorage)); } catch { setMessage("Local storage is unavailable in this browser."); } }, []);
  const persist = (next) => { setPeople(next); try { writePresenters(window.localStorage, next); setMessage("Saved on this device only."); } catch { setMessage("Could not save in this browser's local storage."); } };
  const save = (event) => {
    event.preventDefault();
    if (!name.trim()) return setMessage("Enter a persona name first.");
    const person = createPresenter({ name: name.trim(), references: refs });
    persist([...people, person]); setName(""); setRefs({ front: "", side: "", back: "", closeup: "" });
  };
  return <section aria-label="Presenter library" style={{ margin: "16px 0", padding: 14, background: "#12151b", border: "1px solid #394150", borderRadius: 8, color: "#e2e8f0" }}>
    <h3 style={{ margin: "0 0 6px" }}>Presenter library · local only</h3>
    <p style={{ margin: "0 0 12px", fontSize: 12, color: "#aab4c3" }}>Save persona reference image URLs or local paths on this device. Image generation is a stub and does not call a model.</p>
    <form onSubmit={save}>
      <label style={{ display: "block", fontSize: 12 }}>Persona name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={inputStyle} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
        {keys.map((key) => <label key={key} style={{ fontSize: 12 }}>{label[key]}<input value={refs[key]} onChange={(e) => setRefs({ ...refs, [key]: e.target.value })} maxLength={500} placeholder="/uploads/reference.jpg" style={inputStyle} /></label>)}
      </div>
      <button type="submit" style={buttonStyle}>Save persona</button>
    </form>
    <button type="button" onClick={() => setMessage("Persona image generation is not enabled in v1.")} style={{ ...buttonStyle, marginLeft: 8, background: "#303846" }}>Generate reference images · stub</button>
    {message ? <p role="status" style={{ fontSize: 12 }}>{message}</p> : null}
    {people.map((person) => <div key={person.id} style={{ borderTop: "1px solid #394150", marginTop: 10, paddingTop: 8 }}><strong>{person.name}</strong><button type="button" onClick={() => persist(people.filter((p) => p.id !== person.id))} style={{ float: "right", ...buttonStyle, background: "#4a2525" }}>Remove</button><div style={{ fontSize: 11, color: "#aab4c3" }}>{keys.map((key) => `${label[key]}: ${person.references[key] || "not set"}`).join(" · ")}</div></div>)}
  </section>;
}
const inputStyle = { display: "block", width: "100%", boxSizing: "border-box", margin: "4px 0 9px", padding: 8, color: "#e2e8f0", background: "#080b10", border: "1px solid #475569", borderRadius: 5 };
const buttonStyle = { marginTop: 8, padding: "7px 10px", border: 0, borderRadius: 5, color: "#fff", background: "#2563eb", cursor: "pointer" };
