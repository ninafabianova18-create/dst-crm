import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../config/firebase";
import { collection,  query,  where,  getDocs,  updateDoc,  doc,  orderBy} from "firebase/firestore";
import "../styles/UserProfile.css";

interface StudentData {
  name: string;
  surname: string;
  region: string;
  school: string;
  mail: string;
  telephoneNumber: string;
  typeOfPayment: string;
  period: string;
  amount: string;
  iban: string;
  note: string;
  vs: string;
  [key: string]: string;
}
interface PaymentInfo {
  vs: string;
  amount: string | number;
  date: Date | null;
  message?: string;
  senderIban: string;
  senderName?: string;
  matchStatus?: "matched" | "unmatched" | "ambiguous";
  matchedStudentId?: string | null;
}

// UserProfile component

export const UserProfile = () => {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editedData, setEditedData] = useState<StudentData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [studentDocId, setStudentDocId] = useState<string>("");
  const [payments, setPayments] = useState<PaymentInfo[]>([]);

  const toDateSafe = (value: any): Date | null => {
    // Defensive programming: supports Firestore Timestamp and string/date inputs.
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === "function") {
      const dateFromTs = value.toDate();
      return dateFromTs instanceof Date && !isNaN(dateFromTs.getTime()) ? dateFromTs : null;
    }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  useEffect(() => {
    const fetchStudentAndPayments = async () => {
      if (!user?.email) return;

      try {
        // 1) Find the student's profile by the authenticated user's email.
        const studentQ = query(
          collection(db, "students"),
          where("mail", "==", user.email)
        );

        const studentSnap = await getDocs(studentQ);

        if (studentSnap.empty) {
          setStudentData(null as any); // handle "not found" state
          setPayments([]);
          setLoading(false);
          return;
        }

        const studentDoc = studentSnap.docs[0];
        const student = studentDoc.data() as StudentData;
        console.log("Found student profile:", student); // debug only
        setStudentData(student);
        setEditedData(student);
        setStudentDocId(studentDoc.id);

        // 2) Load payments by VS (variable symbol), then normalize them for UI.
        const studentId = studentDoc.id;
        const vs = String(student.vs ?? "").trim();

        console.log("=== DEBUG PAYMENTS ===");
        console.log("Student ID:", studentId);
        console.log("Student email:", user.email);
        console.log("Student VS:", vs);

        if (!vs) {
          console.log("Student has no VS, no payments will be loaded.");
          setPayments([]);
          setLoading(false);
          return;
        }

        try {
          // Query + orderBy pattern: show newest payments first.
          const paymentsQ = query(
            collection(db, "payments"),
            where("vs", "==", vs),
            orderBy("date", "desc")
          );

          const paymentsSnap = await getDocs(paymentsQ);
          console.log("Total payments with this VS:", paymentsSnap.size);
          
          const paymentsData = paymentsSnap.docs.map((d) => {
            const p = d.data() as any;
            console.log("Platba:", {
              id: d.id,
              vs: p.vs,
              amount: p.amount,
              matchedStudentId: p.matchedStudentId,
              matchStatus: p.matchStatus
            });
            return {
              vs: p.vs,
              amount: p.amount ?? 0,
              date: toDateSafe(p.date),
              message: p.message ?? "",
              senderIban: p.senderIban ?? "",
              senderName: p.senderName ?? "",
              matchStatus: p.matchStatus ?? "unmatched",
              matchedStudentId: p.matchedStudentId ?? null,
            } as PaymentInfo;
          });

          // Business filter: show only matched payments (plus legacy rows without matchStatus).
          const matchedPayments = paymentsData.filter(
            p => p.matchStatus === "matched" || !p.matchStatus
          );
          
          console.log("Matched payments count:", matchedPayments.length);
          console.log("Payments data na zobrazenie:", matchedPayments);
          setPayments(matchedPayments);
        } catch (queryError: any) {
          console.error("PAYMENTS QUERY ERROR:", queryError);
          console.error("Error code:", queryError?.code);
          console.error("Error message:", queryError?.message);
          
          // If a composite index is missing, Firestore returns failed-precondition.
          if (queryError?.code === 'failed-precondition') {
            console.error(" FIRESTORE INDEX IS MISSING. Create the index using the link in the error output.");
          }
          
          setPayments([]);
        }
        setLoading(false);
      } catch (error) {
        console.error("Error loading profile/payments:", error);
        setLoading(false);
      }
    };

    fetchStudentAndPayments();
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditedData((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedData((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleSave = async () => {
    if (!editedData || !studentDocId) return;

    setIsSaving(true);
    try {
      const previousNote = String(studentData?.note ?? "").trim();
      const nextNote = String(editedData?.note ?? "").trim();
      const noteChanged = previousNote !== nextNote;

      const payload: Record<string, any> = {
        ...editedData,
      };

      if (noteChanged) {
        payload.noteNeedsReview = true;
        payload.noteUpdatedAt = new Date();
        payload.noteUpdatedBy = user?.email ?? "";
      }

      await updateDoc(doc(db, "students", studentDocId), payload);
      setStudentData(editedData);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving profile data:", error);
      alert("Chyba pri uložení údajov");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedData(studentData);
    setIsEditing(false);
  };

  if (loading) {
    return <div className="loading">Načítavanie údajov...</div>;
  }

  if (!studentData) {
    return <div className="error">Študentský záznam nenájdený</div>;
  }

  const normalizePeriod = (value?: string) => {
    // Normalize period text variants into a numeric multiplier for financial calculations.
    const v = (value ?? "").toLowerCase().trim();
    if (v === "year" || v === "yearly") return 1;
    if (v.startsWith("half")) return 2;
    if (v === "month" || v === "monthly") return 10;
    return 1;
  };

  const amountPerInstallment =
    Number(String(studentData?.amount || "0").replace(",", ".")) || 0;
  const installmentsPerYear = normalizePeriod(studentData?.period);
  const targetTotal = amountPerInstallment * installmentsPerYear;

  const paidSoFar = payments.reduce((sum, payment) => {
    // Reduce pattern: aggregate all payment amounts into one total.
    const amount = Number(String(payment.amount ?? "0").replace(",", "."));
    return sum + (Number.isNaN(amount) ? 0 : amount);
  }, 0);

  const progressPercent =
    targetTotal > 0
      ? Math.min(100, Math.max(0, (paidSoFar / targetTotal) * 100))
      : 0;
  const progressPercentDisplay =
    targetTotal > 0 ? Math.max(0, (paidSoFar / targetTotal) * 100) : 0;

  //the payments reminders in the profile -- THEY NEED TO BE CONNECTED TO THE AUTOMATIC REMINDER, ADN TO THE ADMIN SO WE CAN OVERRIDE THEM, WHEN NEEDED -- THESE JUST SHOW THE DEADLINS
  type PaymentPlan = "Year" | "Half-year" | "Monthly";

  function getSchoolYearStart(today: Date) {
    // School year starts Sep 1
    const year =
      today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1; // Sep=8
    return year; // 2025 means 2025/2026
  }

  function makeDateLocal(y: number, m: number, d: number) {
    return new Date(y, m, d, 12, 0, 0, 0);
  }

  function formatSK(date: Date) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yy = date.getFullYear();
    return `${dd}.${mm}.${yy}`;
  }

  function getPlanFromStudent(
    periodRaw: string | undefined,
    typeOfPaymentRaw: string | undefined
  ): PaymentPlan {
    const period = (periodRaw || "").toLowerCase();
    const type = (typeOfPaymentRaw || "").toLowerCase();
    const combined = `${period} ${type}`;

    if (combined.includes("month") || combined.includes("mesa")) return "Monthly";
    if (combined.includes("half") || combined.includes("pol")) return "Half-year";
    if (combined.includes("year") || combined.includes("roč")) return "Year";
    return "Year";
  }

  function getDeadlinesForPlan(plan: PaymentPlan, schoolYearStart: number) {
    const y0 = schoolYearStart; // Sep-Dec
    const y1 = schoolYearStart + 1; // Jan-Jun

    const sep30 = makeDateLocal(y0, 8, 30);

    if (plan === "Year") {
      return [sep30];
    }

    if (plan === "Half-year") {
      return [
        sep30,
        makeDateLocal(y1, 1, 28), // Feb 28
      ];
    }

    // Monthly
    return [
      sep30,
      makeDateLocal(y0, 9, 31), // Oct 31
      makeDateLocal(y0, 10, 30), // Nov 30
      makeDateLocal(y0, 11, 31), // Dec 31
      makeDateLocal(y1, 0, 31), // Jan 31
      makeDateLocal(y1, 1, 28), // Feb 28
      makeDateLocal(y1, 2, 31), // Mar 31
      makeDateLocal(y1, 3, 30), // Apr 30
      makeDateLocal(y1, 4, 31), // May 31
      makeDateLocal(y1, 5, 30), // Jun 30
    ];
  }

  function getNextPaymentDeadlineText(
    periodRaw: string | undefined,
    typeOfPaymentRaw: string | undefined,
    unpaidAmount: number,
    today = new Date()
  ) {
    // Deadline is calendar-based (school-year timeline), not tied to paid installment count.
    const plan = getPlanFromStudent(periodRaw, typeOfPaymentRaw);
    const schoolYearStart = getSchoolYearStart(today);
    const deadlines = getDeadlinesForPlan(plan, schoolYearStart);

    const sep1 = makeDateLocal(schoolYearStart, 8, 1);
    if (today < sep1) {
      return "Ešte nemáš deadline na platbu";
    }

    const nextByDate = deadlines.find((d) => d.getTime() >= today.getTime());

    if (!nextByDate) {
      if (unpaidAmount > 0) {
        return "Uhraď prosím všetky neuhradené platby čo najskôr";
      }
      return "Jupííí, všetko uhradené";
    }

    return formatSK(nextByDate);
  }

 
  return (
    <div className="user-profile-container">
      <div className="profile-grid">
        {/* PROGRESS */}
        <aside className="profile-photo-card profile-progress-card">
          <div className="payment-progress">
            <h3 className="card-title progress-card-title">Progress Bar</h3>

            <div className="progress-wrap">
              <div className="progress-meta">
                <div className="progress-row">
                  <span>Zaplatené</span>
                  <b>{paidSoFar.toFixed(0)} €</b>
                </div>
                <div className="progress-row">
                  <span>Očakávané</span>
                  <b>{targetTotal.toFixed(0)} €</b>
                </div>
                <div className="progress-row progress-row-percent">
                  <span>Splnené</span>
                  <b>{progressPercentDisplay.toFixed(0)}%</b>
                </div>
              </div>

              <div className="progress-bar-wrap">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="progress-deadline">
                <span className="field-label">Najbližší deadline</span>
                <span className="field-value">
                  {getNextPaymentDeadlineText(
                    studentData?.period,
                    studentData?.typeOfPayment,
                    Math.max(0, targetTotal - paidSoFar)
                  )}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* PROFILE CARD 1 editable*/}
        <section className="profile-card">
          <div className="card-head">
            <h3 className="card-title">Osobné údaje</h3>

            {!isEditing && (
              <button className="edit-btn" onClick={() => setIsEditing(true)}>
                Upraviť
              </button>
            )}
          </div>

          {isEditing ? (
            <form className="profile-form">
              <div className="form-group">
                <label htmlFor="name">Meno</label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  value={editedData?.name || ""}
                  onChange={handleInputChange}
                  placeholder="Vaše meno"
                />
              </div>
              <div className="form-group">
                <label htmlFor="surname">Priezvisko</label>
                <input
                  id="surname"
                  type="text"
                  name="surname"
                  value={editedData?.surname || ""}
                  onChange={handleInputChange}
                  placeholder="Vaše priezvisko"
                />
              </div>
              <div className="form-group">
                <label htmlFor="region">Región</label>
                <input
                  id="region"
                  type="text"
                  name="region"
                  value={editedData?.region || ""}
                  onChange={handleInputChange}
                  placeholder="Váš región"
                />
              </div>
              <div className="form-group">
                <label htmlFor="school">Škola</label>
                <input
                  id="school"
                  type="text"
                  name="school"
                  value={editedData?.school || ""}
                  onChange={handleInputChange}
                  placeholder="Vaša škola"
                />
              </div>
              <div className="form-group">
                <label htmlFor="mail">Email</label>
                <input
                  id="mail"
                  type="email"
                  name="mail"
                  value={editedData?.mail || ""}
                  onChange={handleInputChange}
                  placeholder="Váš email"
                  disabled
                />
              </div>
              <div className="form-group">
                <label htmlFor="telephoneNumber">Telefónne číslo</label>
                <input
                  id="telephoneNumber"
                  type="tel"
                  name="telephoneNumber"
                  value={editedData?.telephoneNumber || ""}
                  onChange={handleInputChange}
                  placeholder="Vaše telefónne číslo"
                />
              </div>
              <div className="form-group form-group-full">
                <label htmlFor="note">Poznámka</label>
                <textarea
                  id="note"
                  name="note"
                  value={editedData?.note || ""}
                  onChange={handleTextAreaChange}
                  placeholder="Poznámka"
                  rows={4}
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="save-btn"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? "Ukladám..." : "Uložiť"}
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Zrušiť
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-view">
              <div className="profile-field">
                <span className="field-label">Meno:</span>
                <span className="field-value">{studentData?.name || "-"}</span>
              </div>
              <div className="profile-field">
                <span className="field-label">Priezvisko:</span>
                <span className="field-value">
                  {studentData?.surname || "-"}
                </span>
              </div>
              <div className="profile-field">
                <span className="field-label">Región:</span>
                <span className="field-value">
                  {studentData?.region || "-"}
                </span>
              </div>
              <div className="profile-field">
                <span className="field-label">Škola:</span>
                <span className="field-value">
                  {studentData?.school || "-"}
                </span>
              </div>
              <div className="profile-field">
                <span className="field-label">Email:</span>
                <span className="field-value">{studentData?.mail || "-"}</span>
              </div>
              <div className="profile-field">
                <span className="field-label">Telefónne číslo:</span>
                <span className="field-value">
                  {studentData?.telephoneNumber || "-"}
                </span>
              </div>
              <div className="profile-field profile-field-full">
                <span className="field-label">Poznámka:</span>
                <span className="field-value">{studentData?.note || "-"}</span>
              </div>
            </div>
          )}
        </section>

        {/* PROFILE CARD 2 is NOT editable*/}
        <section className="profile-card profile-card-secondary">
          <div className="card-head">
            <h3 className="card-title">Členské info</h3>
          </div>

          <div className="profile-view">
            <div className="profile-field">
              <span className="field-label">Typ platby</span>
              <span className="field-value">
                {studentData?.typeOfPayment || "-"}
              </span>
            </div>

            <div className="profile-field">
              <span className="field-label">Obdobie</span>
              <span className="field-value">{studentData?.period || "-"}</span>
            </div>

            <div className="profile-field">
              <span className="field-label">Suma</span>
              <span className="field-value">{studentData?.amount || "-"}</span>
            </div>

            <div className="profile-field">
              <span className="field-label">Variabilný symbol</span>
              <span className="field-value mono">{studentData?.vs || "-"}</span>
            </div>

            <div className="profile-field profile-field-full">
              <span className="field-label">IBAN</span>
              <span className="field-value mono">
                SK02 8330 0000 0023 0154 8060 (Fio banka)
              </span>
            </div>

          </div>
        </section>

        <section className="profile-card profile-card-payments">
          <div className="card-head">
            <h3 className="card-title">Platby</h3>
          </div>

          {payments.length === 0 ? (
            <div className="profile-field">
              <span className="field-value">Žiadne priradené platby</span>
            </div>
          ) : (
            <div className="payments-table-wrap">
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>VS</th>
                    <th>Sender</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => (
                    <tr key={`${payment.vs}-${payment.date?.toString() || index}`}>
                      <td>{payment.date instanceof Date ? payment.date.toLocaleDateString("sk-SK") : "-"}</td>
                      <td>{payment.amount ?? "-"}</td>
                      <td>{payment.vs ?? "-"}</td>
                      <td>{payment.senderName || payment.senderIban || "-"}</td>
                      <td>{payment.message || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
