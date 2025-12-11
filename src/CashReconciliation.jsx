import React, { useState, useEffect } from "react";

const API_URL = "https://script.google.com/macros/s/AKfycbzSOGyuU1w4MVQ-S4ogfS9cBWtosra8WDvbutkScJWdgEQFGwN6XkTZ0Ms1o5wHaDN3Jg/exec";

async function api(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
  return await res.json();
}

export default function CashReconciliation() {
  const [entries, setEntries] = useState([]);
  const [withdraws, setWithdraws] = useState([]);
  const [form, setForm] = useState({ date: "", cashIn: "", frontSafe: "", backSafe: "", deposited: "", notes: "" });
  const [withdraw, setWithdraw] = useState({ amount: "", reason: "" });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [frontTotal, setFrontTotal] = useState(0);
  const [backTotal, setBackTotal] = useState(0);

  useEffect(() => { loadEntries(); loadWithdraws(); }, []);

  const loadEntries = async () => {
    const data = await api("get", { sheet: "entries" });
    const rows = data.slice(1).map((r, i) => ({
      row: i + 2,
      timestamp: r[0],
      date: r[1],
      cashIn: Number(r[2]),
      frontSafe: Number(r[3]),
      backSafe: Number(r[4]),
      deposited: Number(r[5]),
      notes: r[6],
      mismatch: r[7] === true || r[7] === "TRUE",
      difference: Number(r[8]),
      approved: r[9] === true || r[9] === "TRUE",
      approvedReason: r[10],
    }));
    setEntries(rows);
    recalcTotals(rows);
  };

  const loadWithdraws = async () => {
    const data = await api("get", { sheet: "withdraws" });
    const rows = data.slice(1).map((r, i) => ({
      row: i + 2,
      timestamp: r[0],
      date: r[1],
      amount: Number(r[2]),
      reason: r[3],
    }));
    setWithdraws(rows);
  };

  const calculateMismatch = (e) => {
    const accounted = Number(e.frontSafe) + Number(e.backSafe) + Number(e.deposited);
    const cashIn = Number(e.cashIn);
    return { mismatch: accounted !== cashIn, difference: cashIn - accounted };
  };

  const handleSubmit = async () => {
    const entry = {
      date: form.date,
      cashIn: Number(form.cashIn),
      frontSafe: Number(form.frontSafe),
      backSafe: Number(form.backSafe),
      deposited: Number(form.deposited),
      notes: form.notes,
      approved: false,
      approvedReason: "",
    };
    const calc = calculateMismatch(entry);
    entry.mismatch = calc.mismatch;
    entry.difference = calc.difference;
    await api("batchInsert", {
      sheet: "entries",
      rows: [[entry.date, entry.cashIn, entry.frontSafe, entry.backSafe, entry.deposited, entry.notes, entry.mismatch, entry.difference, entry.approved, entry.approvedReason]],
    });
    await loadEntries();
    setForm({ date: "", cashIn: "", frontSafe: "", backSafe: "", deposited: "", notes: "" });
  };

  const deleteEntry = async (row) => {
    if (!window.confirm("Delete this entry?")) return;
    await api("delete", { sheet: "entries", rowIndex: row });
    await loadEntries();
  };

  const startEdit = (e) => { setEditing(e.row); setEditForm(e); };
  const saveEdit = async () => {
    const updated = { ...editForm };
    const calc = calculateMismatch(updated);
    updated.mismatch = calc.mismatch;
    updated.difference = calc.difference;
    await api("edit", {
      sheet: "entries",
      rowIndex: editing,
      values: [updated.date, updated.cashIn, updated.frontSafe, updated.backSafe, updated.deposited, updated.notes, updated.mismatch, updated.difference, updated.approved, updated.approvedReason],
    });
    setEditing(null);
    await loadEntries();
  };

  const approveMismatch = async (e) => {
    const reason = prompt("Approval reason:");
    if (!reason) return;
    await api("edit", {
      sheet: "entries",
      rowIndex: e.row,
      values: [e.date, e.cashIn, e.frontSafe, e.backSafe, e.deposited, e.notes, e.mismatch, e.difference, true, reason],
    });
    await loadEntries();
  };

  const handleWithdraw = async () => {
    const amt = Number(withdraw.amount);
    if (amt > backTotal) return alert("Not enough in back safe");
    await api("batchInsert", { sheet: "withdraws", rows: [[new Date().toISOString().slice(0, 10), amt, withdraw.reason]] });
    await loadWithdraws();
    setWithdraw({ amount: "", reason: "" });
  };

  const recalcTotals = (rows) => {
    let f = 0, b = 0;
    rows.forEach((e) => { f += e.frontSafe; b += e.backSafe; });
    setFrontTotal(f);
    setBackTotal(b);
  };

  const formatDiff = (d) => { if (d === 0) return "Match"; if (d > 0) return `Short $${d}`; return `Over $${Math.abs(d)}`; };

  return <div className="container">
    <h1>Daily Cash Reconciliation (V2)</h1>
    <section className="entry-form">
      <h2>Add Entry</h2>
      {Object.keys(form).map((k) => <input key={k} type={k==="date"?"date":k==="notes"?"text":"number"} placeholder={k} value={form[k]} onChange={(e)=>setForm({...form,[k]:e.target.value})} />)}
      <button onClick={handleSubmit}>Save</button>
    </section>
    <section className="totals">
      <h2>Totals</h2>
      <p>Front Safe: ${frontTotal}</p>
      <p>Back Safe: ${backTotal}</p>
    </section>
    <section className="entries-list">
      <h2>Entries</h2>
      {entries.map((e)=><div key={e.row} className="entry">
        {editing===e.row?(<div>{Object.keys(editForm).map((k)=>k!=="row"&&<input key={k} value={editForm[k]} onChange={(ev)=>setEditForm({...editForm,[k]:ev.target.value})}/>)}<button onClick={saveEdit}>Save</button><button onClick={()=>setEditing(null)}>Cancel</button></div>):(<div>
          <p>Date: {e.date}</p>
          <p>Cash In: ${e.cashIn}</p>
          <p>Difference: {formatDiff(e.difference)}</p>
          {e.mismatch&&!e.approved&&<button onClick={()=>approveMismatch(e)}>Approve Mismatch</button>}
          {e.approved&&<p>Approved ✔ ({e.approvedReason})</p>}
          <button onClick={()=>startEdit(e)}>Edit</button>
          <button onClick={()=>deleteEntry(e.row)}>Delete</button>
        </div>)}
      </div>)}
    </section>
    <section className="withdraw">
      <h2>Withdraw from Back Safe</h2>
      <input type="number" placeholder="Amount" value={withdraw.amount} onChange={(e)=>setWithdraw({...withdraw,amount:e.target.value})}/>
      <input placeholder="Reason" value={withdraw.reason} onChange={(e)=>setWithdraw({...withdraw,reason:e.target.value})}/>
      <button onClick={handleWithdraw}>Withdraw</button>
    </section>
    <section className="withdraw-log">
      <h2>Withdraw Records</h2>
      {withdraws.map((w)=><div key={w.row}><p>Date: {w.date}</p><p>Amount: ${w.amount}</p><p>Reason: {w.reason}</p></div>)}
    </section>
  </div>;
}