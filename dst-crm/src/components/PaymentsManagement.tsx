import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "../styles/PaymentsManagement.css"; // pridaj vlastné štýly

// Typy
interface PaymentInfo {
  id?: string;
  vs: string;
  amount: number | string;
  date: Date | null;
  message?: string;
  senderIban?: string;
  senderName?: string;
  matchedStudentId?: string | null;
  matchStatus?: "matched" | "unmatched" | "ambiguous";
  createdAt?: Date | null;
}

interface StudentShort {
  id: string;
  name?: string;
  surname?: string;
  vs?: string;
  school?: string;
}
type StatusFilter = "all" | "matched" | "unmatched" | "ambiguous";

export const PaymentsManagement: React.FC = () => {
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // pre priradenie
  const [searchVS, setSearchVS] = useState("");
  const [studentResults, setStudentResults] = useState<StudentShort[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null
  );
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      // načítaj všetky platby, zoradené podľa dátumu (desc)
      const paymentsQ = query(
        collection(db, "payments"),
        orderBy("date", "desc")
      );
      const snap = await getDocs(paymentsQ);
      const list: PaymentInfo[] = [];
      console.log("Načítané platby:", snap.size);
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({
          id: d.id,
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          amount: data.amount ?? data.AMount ?? 0,
          date: data.date?.toDate ? data.date.toDate() : data.date ?? null,
          message: data.message ?? "",
          senderIban: data.senderIban ?? "",
          senderName: data.senderName ?? "",
          matchedStudentId: data.matchedStudentId ?? null,
          matchStatus:
            data.matchStatus ??
            (data.matchedStudentId ? "matched" : "unmatched"),
          createdAt: data.createdAt?.toDate
            ? data.createdAt.toDate()
            : data.createdAt ?? null,
        });
      });
      setPayments(list);
    } catch (err) {
      console.error("Chyba pri načítaní platieb:", err);
      setMessage("Chyba pri načítaní platieb");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const removeAssignment = async (paymentId: string) => {
    try {
      await updateDoc(doc(db, "payments", paymentId), {
        matchedStudentId: null,
        matchStatus: "unmatched",
      });
      setMessage("Priradenie bolo odstránené.");
      setMessageType("success");
      loadPayments();
    } catch (err) {
      console.error("Chyba pri odstraňovaní priradenia:", err);
      setMessage("Chyba pri odstraňovaní priradenia");
      setMessageType("error");
    }
  };

  const deletePayment = async (paymentId: string) => {
    if (!confirm("Naozaj chcete vymazať túto platbu?")) return;
    try {
      await deleteDoc(doc(db, "payments", paymentId));
      setMessage("Platba bola vymazaná.");
      setMessageType("success");
      loadPayments();
    } catch (err) {
      console.error("Chyba pri mazaní platby:", err);
      setMessage("Chyba pri mazaní platby");
      setMessageType("error");
    }
  };

  // Hľadaj študentov podľa VS (rýchle vyhľadávanie pri priraďovaní)
  const searchStudentsByVS = async (vs: string) => {
    setStudentResults([]);
    if (!vs.trim()) return;
    try {
      const q = query(collection(db, "students"), where("vs", "==", vs));
      const snap = await getDocs(q);
      const res: StudentShort[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        res.push({
          id: d.id,
          name: data.name,
          surname: data.surname,
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          school: data.school,
        });
      });
      setStudentResults(res);
    } catch (err) {
      console.error("Chyba pri hľadaní študentov:", err);
      setMessage("Chyba pri hľadaní študentov");
      setMessageType("error");
    }
  };

  const assignToStudent = async (paymentId: string, studentId: string) => {
    setAssigning(true);
    try {
      console.log("=== PRIRADENIE PLATBY ===");
      console.log("Payment ID:", paymentId);
      console.log("Student ID:", studentId);
      
      await updateDoc(doc(db, "payments", paymentId), {
        matchedStudentId: studentId,
        matchStatus: "matched",
      });
      
      console.log("Platba úspešne priradená!");
      
      setMessage("Platba priradená ku študentovi.");
      setMessageType("success");
      setSelectedPaymentId(null);
      setStudentResults([]);
      setSearchVS("");
      loadPayments();
    } catch (err) {
      console.error("Chyba pri priraďovaní platby:", err);
      setMessage("Chyba pri priraďovaní platby");
      setMessageType("error");
    } finally {
      setAssigning(false);
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (statusFilter === "all") return true;
    return (p.matchStatus ?? "unmatched") === statusFilter;
  });

  if (loading) {
    return (
      <div className="payments-management-container">Načítavam platby...</div>
    );
  }

  return (
    <div className="payments-management-container">
      <div className="payments-management-header">
        <h2>Správa platieb</h2>
        <p>
          Prehľad importovaných platieb, priraďovanie k študentom a ich správa
        </p>
      </div>

      {message && (
        <div className={`message message-${messageType}`}>{message}</div>
      )}

      <div className="payments-card">
        {payments.length === 0 ? (
          <p className="empty-message">
            Žiadne platby pre filter:{" "}
            {statusFilter === "all"
              ? "Všetky"
              : statusFilter === "matched"
              ? "Priradené"
              : statusFilter === "ambiguous"
              ? "Nejednoznačné"
              : "Nepriradené"}
          </p>
        ) : (
          <>
            <div className="filters-bar">
              <div className="filters-left">
                <span className="filters-label">Filter:</span>

                <button
                  className={`filter-chip ${
                    statusFilter === "all" ? "active" : ""
                  }`}
                  onClick={() => setStatusFilter("all")}
                >
                  Všetky ({payments.length})
                </button>

                <button
                  className={`filter-chip ${
                    statusFilter === "unmatched" ? "active" : ""
                  }`}
                  onClick={() => setStatusFilter("unmatched")}
                >
                  Nepriradené (
                  {
                    payments.filter(
                      (p) => (p.matchStatus ?? "unmatched") === "unmatched"
                    ).length
                  }
                  )
                </button>

                <button
                  className={`filter-chip ${
                    statusFilter === "matched" ? "active" : ""
                  }`}
                  onClick={() => setStatusFilter("matched")}
                >
                  Priradené (
                  {payments.filter((p) => p.matchStatus === "matched").length})
                </button>

                <button
                  className={`filter-chip ${
                    statusFilter === "ambiguous" ? "active" : ""
                  }`}
                  onClick={() => setStatusFilter("ambiguous")}
                >
                  Nejednoznačné (
                  {payments.filter((p) => p.matchStatus === "ambiguous").length}
                  )
                </button>
              </div>

              <div className="filters-right">
                <span className="filters-count">
                  Zobrazené: <b>{filteredPayments.length}</b>
                </span>
              </div>
            </div>
            <div className="payments-table-wrapper">
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>VS</th>
                    <th>Sum</th>
                    <th>Dátum</th>
                    <th>Odosielateľ</th>
                    <th>Správa</th>
                    <th>Stav</th>
                    <th>Priradené k</th>
                    <th>Akcia</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <React.Fragment key={p.id}>
                      <tr>
                        <td>{p.vs || "-"}</td>
                        <td>
                          {typeof p.amount === "number"
                            ? (p.amount / 100).toFixed(2) // ak máš uložené v centoch
                            : String(p.amount)}
                        </td>
                        <td>
                          {p.date
                            ? new Date(p.date).toLocaleString("sk-SK")
                            : "-"}
                        </td>
                        <td>{p.senderName || p.senderIban || "-"}</td>
                        <td className="message-cell">{p.message || "-"}</td>
                        <td>
                          <span
                            className={`status-badge ${
                              p.matchStatus || "unmatched"
                            }`}
                          >
                            {p.matchStatus === "matched"
                              ? "Priradené"
                              : p.matchStatus === "ambiguous"
                              ? "Nejednoznačné"
                              : "Nepriradené"}
                          </span>
                        </td>
                        <td>{p.matchedStudentId ?? "-"}</td>
                        <td>
                          <button
                            style={{ color: "#007bff" }}
                            onClick={() => {
                              setSelectedPaymentId(p.id ?? null);
                              setSearchVS(p.vs ?? "");
                              searchStudentsByVS(p.vs ?? "");
                            }}
                          >
                            Priradiť
                          </button>

                          {p.matchStatus === "matched" && p.matchedStudentId && (
                            <button
                              style={{ color: "#007bff" }}
                              onClick={() => removeAssignment(p.id!)}
                            >
                              Vyčistiť
                            </button>
                          )}

                          <button
                            onClick={() => deletePayment(p.id!)}
                            className="danger"
                          >
                            Vymazať
                          </button>
                        </td>
                      </tr>

                      {/* Panel priradenia - otvoríme pod platbou */}
                      {selectedPaymentId === p.id && (
                        <tr className="assign-payment-row">
                          <td colSpan={8}>
                            <div className="assign-panel">
                              <h3>Priradiť platbu</h3>
                              <div className="assign-row">
                                <label>Hľadaj študenta podľa VS:</label>
                                <input
                                  type="text"
                                  placeholder="Zadaj VS..."
                                  value={searchVS}
                                  onChange={(e) => {
                                    setSearchVS(e.target.value);
                                    searchStudentsByVS(e.target.value);
                                  }}
                                />
                                <button
                                  onClick={() => setSelectedPaymentId(null)}
                                  style={{
                                    marginLeft: "auto",
                                    background: "#ff6b6b",
                                    color: "white",
                                    border: "none",
                                  }}
                                >
                                  Zbruš
                                </button>
                              </div>

                              {studentResults.length > 0 && (
                                <div className="search-results">
                                  <table className="search-table">
                                    <thead>
                                      <tr>
                                        <th>Meno</th>
                                        <th>VS</th>
                                        <th>Škola</th>
                                        <th>Akcia</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {studentResults.map((s) => (
                                        <tr key={s.id}>
                                          <td>{(s.name || "") + " " + (s.surname || "")}</td>
                                          <td>{s.vs}</td>
                                          <td>{s.school || "-"}</td>
                                          <td>
                                            <button
                                              onClick={() =>
                                                assignToStudent(selectedPaymentId, s.id)
                                              }
                                              disabled={assigning}
                                            >
                                              Priradiť k tomuto študentovi
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentsManagement;
