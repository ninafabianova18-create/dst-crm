import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "../styles/Communication.css";

interface StudentData {
  id: string;
  name?: string;
  surname?: string;
  mail?: string;
  school?: string;
  vs?: string; // string!
  amount?: number | string; // base amount (in EUR)
  period?: string; // "Year" | "Half-year" | "Month"
}

interface PaymentInfo {
  id: string;
  vs: string;
  amount: number | string;
  date?: Date | null;
  message?: string;
  senderName?: string;
  senderIban?: string;
  matchedStudentId?: string | null;
  matchStatus?: "matched" | "unmatched" | "ambiguous";
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface CommunicationProps {
  selectedCohort?: string;
  selectedInstallmentCheckpoint?: number;
  onSelectedInstallmentCheckpointChange?: (value: number) => void;
}

const getCohortFromVS = (vs?: string) => {
  const clean = String(vs ?? "").trim();
  if (clean.length < 4) return "";
  return clean.slice(0, 4);
};

export const Communication: React.FC<CommunicationProps> = ({
  selectedCohort = "all",
  selectedInstallmentCheckpoint,
  onSelectedInstallmentCheckpointChange,
}) => {
  // Central data + UI state for payment checks, filters, and email sending.
  const [students, setStudents] = useState<StudentData[]>([]);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Number 1..10 entered by the user
  const [localInstallmentIndex, setLocalInstallmentIndex] = useState<number>(1);

  // Option to locally override expected amount for a student: map studentId -> overrideNumber
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  // Filter by computed status: "all" | "paid" | "unpaid" | "overpaid"
  const [statusFilter, setStatusFilter] = useState<
    "all" | "paid" | "unpaid" | "overpaid"
  >("all");

  // Email modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [emailSubject, setEmailSubject] = useState("");
  const [emailText, setEmailText] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const installmentIndex = selectedInstallmentCheckpoint ?? localInstallmentIndex;
  const setInstallmentIndex = onSelectedInstallmentCheckpointChange ?? setLocalInstallmentIndex;

  useEffect(() => {
    // One-shot load on mount: this component uses an immediate Firestore snapshot.
    loadAll();
  }, [selectedCohort]);

  useEffect(() => {
    setSelectedStudents(new Set());
  }, [selectedCohort]);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Load + normalize student documents into a typed frontend model.
      const studentsSnap = await getDocs(collection(db, "students"));
      const studentsList: StudentData[] = studentsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name ?? "",
          surname: data.surname ?? "",
          mail: data.mail ?? "",
          school: data.school ?? "",
          period: data.period ?? "",
          // Important: keep VS as a string
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          // Amount is expected in EUR
          amount:
            typeof data.amount === "number" ? data.amount : data.amount ? Number(data.amount) : 0,
        };
      });

      // Load payments sorted by date for table display.
      const paymentsQ = query(collection(db, "payments"), orderBy("date", "desc"));
      const paymentsSnap = await getDocs(paymentsQ);
      const paymentsList: PaymentInfo[] = paymentsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          amount:
            typeof data.amount === "number" ? data.amount : data.amount ? Number(data.amount) : 0,
          date: data.date?.toDate ? data.date.toDate() : data.date ?? null,
          message: data.message ?? "",
          senderName: data.senderName ?? "",
          senderIban: data.senderIban ?? "",
          matchedStudentId: data.matchedStudentId ?? null,
          matchStatus: data.matchStatus ?? (data.matchedStudentId ? "matched" : "unmatched"),
        };
      });

      // Sort by surname
      studentsList.sort((a, b) => {
        const as = ((a.surname ?? "") + " " + (a.name ?? "")).toLowerCase();
        const bs = ((b.surname ?? "") + " " + (b.name ?? "")).toLowerCase();
        return as.localeCompare(bs);
      });

      const cohortStudents = selectedCohort === "all"
        ? studentsList
        : studentsList.filter((s) => getCohortFromVS(s.vs) === selectedCohort);
      const cohortStudentIds = new Set(cohortStudents.map((s) => s.id));
      const cohortPayments = selectedCohort === "all"
        ? paymentsList
        : paymentsList.filter((p) => {
            const sid = String(p.matchedStudentId ?? "").trim();
            if (sid && cohortStudentIds.has(sid)) return true;
            return getCohortFromVS(p.vs) === selectedCohort;
          });

      setStudents(cohortStudents);
      setPayments(cohortPayments);
    } catch (err) {
      // EN: Error while loading
      console.error("Chyba pri načítaní:", err);
      // EN: Error while loading data
      setMessage("Chyba pri načítaní dát");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  // useMemo pattern: cache derived studentId -> payments mapping for render performance.
  const paymentsByStudentId = useMemo(() => {
    const map = new Map<string, PaymentInfo[]>();
    for (const p of payments) {
      const key = (p.matchedStudentId ?? "").trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [payments]);

  // Helper: read base amount (override or student value)
  const baseAmount = (s: StudentData) => {
    const o = overrides[s.id];
    if (o !== undefined) return o;
    const v = s.amount ?? 0;
    return typeof v === "number" ? v : Number(v ?? 0);
  };

  // Business-rules function: compute expected amount from period + installment index.
  const expectedForStudent = (s: StudentData) => {
    const base = baseAmount(s);
    const period = (s.period ?? "").toString().toLowerCase();
    const idx = clamp(installmentIndex || 1, 1, 10);

    if (period === "year") return base * 1;
    if (period === "half-year" || period === "halfyear" || period === "half year") {
      if (idx >= 1 && idx <= 5) return base * 1;
      return base * 2;
    }
    if (period === "month" || period === "monthly") return base * idx;

    return base * idx;
  };

  // Paid amount (sum of all payments assigned to this student)
  const paidForStudent = (s: StudentData) => {
    const studentId = (s.id ?? "").trim();
    if (!studentId) return 0;
    const arr = paymentsByStudentId.get(studentId) ?? [];
    return arr.reduce((acc, p) => {
      const v = typeof p.amount === "number" ? p.amount : Number(p.amount ?? 0);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
  };

  // Derived state: status is computed and not persisted separately in the database.
  const statusForStudent = (s: StudentData) => {
    const expected = expectedForStudent(s);
    const paid = paidForStudent(s);

    if (expected > 0 && paid === expected) return "paid";
    if (paid > expected) return "overpaid";
    return "unpaid";
  };

  // Combined filter: depends on status, payments, installment index, and override values.
  const filteredStudents = useMemo(() => {
    if (statusFilter === "all") return students;
    return students.filter((s) => {
      const st = statusForStudent(s);
      return st === statusFilter;
    });
  }, [students, statusFilter, paymentsByStudentId, installmentIndex, overrides]);

  // Override handler (local state)
  const setOverrideForStudent = (studentId: string, value: number) => {
    setOverrides((prev) => ({ ...prev, [studentId]: value }));
  };

  const saveOverrideToStudent = async (studentId: string) => {
    const val = overrides[studentId];
    if (val === undefined) {
      // EN: No value set to save
      setMessage("Nie je nastavená žiadna hodnota na uloženie.");
      setMessageType("error");
      return;
    }
    try {
      // updateDoc patches only amount; other document fields remain unchanged.
      await updateDoc(doc(db, "students", studentId), { amount: val });
      // EN: Expected amount saved for student
      setMessage("Očakávaná suma uložená pre študenta.");
      setMessageType("success");
      loadAll();
    } catch (err) {
      console.error(err);
      // EN: Error while saving
      setMessage("Chyba pri ukladaní.");
      setMessageType("error");
    }
  };

  // Email sending
  const toggleStudentSelection = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const toggleAllStudents = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const sendEmailToSelected = async () => {
    if (selectedStudents.size === 0) {
      // EN: Select at least one student
      setMessage("Vyberte aspoň jedného študenta");
      setMessageType("error");
      return;
    }

    if (!emailSubject.trim() || !emailText.trim()) {
      // EN: Fill in subject and message
      setMessage("Vyplňte predmet a správu");
      setMessageType("error");
      return;
    }

    setSendingEmail(true);
    try {
      // Selection -> recipient list transform: Set IDs -> filtered email addresses.
      const emails = filteredStudents
        .filter(s => selectedStudents.has(s.id))
        .map(s => s.mail)
        .filter(m => m && m.trim());

      if (emails.length === 0) {
        // EN: Selected students do not have an email address
        setMessage("Vybratí študenti nemajú emailovú adresu");
        setMessageType("error");
        setSendingEmail(false);
        return;
      }

      const response = await fetch("/api/send-mail", {
        // API boundary pattern: frontend sends payload, backend handles SMTP details.
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bcc: emails,
          subject: emailSubject,
          text: emailText,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      const rawBody = await response.text();
      const isJson = contentType.toLowerCase().includes("application/json");
      const parsedBody = isJson && rawBody ? JSON.parse(rawBody) : null;

      if (response.ok) {
        // EN: Email successfully sent to selected students
        setMessage(`Email úspešně odeslaný ${emails.length} študentom`);
        setMessageType("success");
        setShowEmailModal(false);
        setSelectedStudents(new Set());
        setEmailSubject("");
        setEmailText("");
      } else {
        const backendError = parsedBody?.error;
        const htmlReplyHint = rawBody.trim().startsWith("<!DOCTYPE") || rawBody.trim().startsWith("<html");

        console.error("Backend error:", {
          status: response.status,
          contentType,
          body: parsedBody ?? rawBody,
        });

        if (htmlReplyHint) {
          // EN: API endpoint returned HTML instead of JSON; check server/routing
          setMessage("Chyba pri odoslaní: API endpoint /api/send-mail vrátil HTML namiesto JSON. Skontrolujte, či beží email server a routing /api.");
        } else {
          // EN: Sending failed with backend error or HTTP status
          setMessage(`Chyba pri odoslaní: ${backendError || `HTTP ${response.status}`}`);
        }
        setMessageType("error");
      }
    } catch (err: any) {
      console.error("Mail send error:", err);
      if (err instanceof SyntaxError) {
        // EN: API did not return JSON response; check backend endpoint
        setMessage("Chyba pri odoslaní emailu: API nevrátilo JSON odpoveď. Skontrolujte backend server (/api/send-mail).");
      } else {
        // EN: Generic email send error
        setMessage(`Chyba pri odoslaní emailu: ${err?.message || "Neznáma chyba"}`);
      }
      setMessageType("error");
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    // EN: Loading data...
    return <div className="installments-check-container">Načítavam dáta...</div>;
  }

  return (
    <div className="installments-check-container">
      <div className="header">
        <h2>Komunikácia a kontrola {/* EN: Communication and control */}</h2>
        <p>Vyber číslo 1–10 (poradie / počet splátok) a skontroluj očakávané vs. zaplatené sumy {/* EN: Select number 1-10 (installment order/count) and check expected vs paid amounts */}</p>
      </div>

      {message && <div className={`message message-${messageType}`}>{message}</div>}

      <div className="controls">
        <label>
          <p>Poradie / počet splátok (1–10): {/* EN: Installment order / count (1-10) */}</p>
          <input
            type="number"
            min={1}
            max={10}
            value={installmentIndex}
            onChange={(e) => setInstallmentIndex(clamp(Number(e.target.value) || 1, 1, 10))}
          />
        </label>

        {/* FILTER BY COMPUTED STATUS */}
        <label>
          <p>Filter podľa stavu: {/* EN: Filter by status */}</p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{ marginLeft: 8, padding: "6px 8px", borderRadius: 6 }}
          >
            <option value="all">Všetky {/* EN: All */}</option>
            <option value="paid">Plne {/* EN: Fully paid */}</option>
            <option value="unpaid">Nedoplatok {/* EN: Underpaid */}</option>
            <option value="overpaid">Preplatok {/* EN: Overpaid */}</option>
          </select>
        </label>

        <button style={{ marginLeft: 12 }} onClick={loadAll}>
          Obnoviť dáta {/* EN: Refresh data */}
        </button>

        <button
          className="send-email-btn"
          style={{ marginLeft: 12 }}
          onClick={() => setShowEmailModal(true)}
          disabled={filteredStudents.length === 0}
        >
          Odoslať email ({selectedStudents.size} vybrato) {/* EN: Send email (... selected) */}
        </button>
      </div>

      <div className="table-wrapper">
        <table className="installments-table">
          <thead>
            <tr>
              <th>
                {/* EN: Select all */}
                <input
                  type="checkbox"
                  checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                  onChange={toggleAllStudents}
                  title="Vybrať všetkých"
                />
              </th>
              <th>Študent {/* EN: Student */}</th>
              <th>VS</th>
              <th>Period {/* EN: Period */}</th>
              <th>Očakávané {/* EN: Expected */}</th>
              <th>Zaplatené {/* EN: Paid */}</th>
              <th>Rozdiel {/* EN: Difference */}</th>
              <th>Stav {/* EN: Status */}</th>
              <th>Upraviť očakávané {/* EN: Edit expected amount */}</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s) => {
              const expected = expectedForStudent(s);
              const paid = paidForStudent(s);
              const diff = expected - paid;
              const status = statusForStudent(s);
              return (
                <tr key={s.id} className={`row-${status}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedStudents.has(s.id)}
                      onChange={() => toggleStudentSelection(s.id)}
                    />
                  </td>
                  <td>
                    <div className="student-name">{(s.name ?? "") + " " + (s.surname ?? "")}</div>
                    <div className="student-mail">{s.mail}</div>
                  </td>
                  <td className="vs-cell">{s.vs || "-"}</td>
                  <td>{s.period || "-"}</td>
                  <td>{expected}</td>
                  <td>{paid}</td>
                  <td className={`diff ${diff > 0 ? "positive" : diff < 0 ? "negative" : "zero"}`}>
                    {diff}
                  </td>
                  <td>
                    <span className={`status-badge ${status}`}>
                      {status === "paid"
                        ? "Plne" // EN: Fully paid
                        : status === "unpaid"
                        ? "Nedoplatok" // EN: Underpaid
                        : "Preplatok" // EN: Overpaid
                      }
                    </span>
                  </td>
                  <td>
                    <div className="override-row">
                      {/* EN: Override the base expected amount (per installment) */}
                      <input
                        type="number"
                        step="1"
                        value={overrides[s.id] ?? (typeof s.amount === "number" ? s.amount : Number(s.amount ?? 0))}
                        onChange={(e) => setOverrideForStudent(s.id, Number(e.target.value || 0))}
                        title="Prepíše základnú očakávanú sumu (per installment)"
                      />
                      <button onClick={() => saveOverrideToStudent(s.id)}>Uložiť {/* EN: Save */}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredStudents.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 16 }}>
                  Žiadni študenti pre aktuálny filter stavu. {/* EN: No students for the current status filter. */}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="email-modal-overlay">
          <div className="email-modal">
            <h3 className="email-modal-title">Odoslať email {/* EN: Send email */}</h3>
            <p className="email-modal-count">
              Vybratí študenti: <strong>{selectedStudents.size}</strong> {/* EN: Selected students */}
            </p>

            <div className="email-field">
              <label className="email-label">Predmet: {/* EN: Subject */}</label>
              {/* EN: For example: Payment reminder */}
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Napr. Upozornenie na platbu"
                className="email-input"
              />
            </div>

            <div className="email-field">
              <label className="email-label">Správa: {/* EN: Message */}</label>
              {/* EN: Write message... */}
              <textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Napíšte správu..."
                rows={6}
                className="email-textarea"
              />
            </div>

            <div className="email-modal-actions">
              <button
                onClick={() => setShowEmailModal(false)}
                className="email-modal-btn"
              >
                Zrušiť {/* EN: Cancel */}
              </button>
              <button
                onClick={sendEmailToSelected}
                disabled={sendingEmail}
                className="email-modal-btn email-modal-btn-primary"
              >
                {sendingEmail ? "Odosielam..." /* EN: Sending... */ : "Odoslať email" /* EN: Send email */}
              </button>
            </div>
          </div>
        </div>
      )}

      <style >{`
        .controls { display:flex; gap:12px; align-items:center; margin-bottom:12px; }
        .installments-table { width:100%; border-collapse:collapse; }
        .installments-table th, .installments-table td { padding:8px; border:1px solid #e6e6e6; text-align:left; vertical-align:middle; }
        .row-paid { background:#e8f7e8; }      
        .row-unpaid { background:rgba(253, 83, 0, 0.14); }  
        .row-overpaid { background:#e8f0ff; }  
        .status-badge.paid { color: #0b7a0b; font-weight:600; }
        .status-badge.unpaid { color: #c53f00; font-weight:600; }
        .status-badge.overpaid { color: #0b47a6; font-weight:600; }
        .diff.positive { color: #a10000; } 
        .diff.zero { color: #1f7a1f; }
      `}</style>
      
    
    </div>
  );
};

export default Communication;
