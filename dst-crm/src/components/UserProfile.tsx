import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../config/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  orderBy,
} from "firebase/firestore";
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
}

// Funkcia tvoriaca komponent UserProfile --> uzivatelsky profil
//poznamka

export const UserProfile = () => {
  //premene
  const { user } = useAuth();
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editedData, setEditedData] = useState<StudentData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [studentDocId, setStudentDocId] = useState<string>("");
  const [payments, setPayments] = useState<PaymentInfo[]>([]);

  const toDateSafe = (value: any): Date | null => {
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
        // 1) nájdi študenta podľa mailu
        const studentQ = query(
          collection(db, "students"),
          where("mail", "==", user.email)
        );

        const studentSnap = await getDocs(studentQ);

        if (studentSnap.empty) {
          setStudentData(null as any); // alebo ako riešiš "nenájdené"
          setPayments([]);
          setLoading(false);
          return;
        }

        const studentDoc = studentSnap.docs[0];
        const student = studentDoc.data() as StudentData;
        console.log("Našiel som študenta:", student); // pro debug, můžeš odstranit
        setStudentData(student);
        setEditedData(student);
        setStudentDocId(studentDoc.id);

        // 2) ak má VS, dotiahni platby

        const vs = String(student.vs ?? "").trim();

        console.log("Hledám platby pro VS:", vs);

        if (!vs) {
          setPayments([]);
          setLoading(false);
          return;
        }

        const paymentsQ = query(
          collection(db, "payments"),
          where("vs", "==", vs),
          orderBy("date", "desc") // vyžaduje index, ak bude treba Firestore ti ho ponúkne vytvoriť
        );

        const paymentsSnap = await getDocs(paymentsQ);
        const paymentsData = paymentsSnap.docs.map((d) => {
          const p = d.data() as any;
          return {
            vs: p.vs,
            amount: p.amount ?? 0,
            date: toDateSafe(p.date),
            message: p.message ?? "",
            senderIban: p.senderIban ?? "",
            senderName: p.senderName ?? "",
          } as PaymentInfo;
        });

        setPayments(paymentsData);
        setLoading(false);
      } catch (error) {
        console.error("Chyba pri načítaní profilu/platieb:", error);
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
      await updateDoc(doc(db, "students", studentDocId), editedData);
      setStudentData(editedData);
      setIsEditing(false);
    } catch (error) {
      console.error("Chyba pri uložení údajov:", error);
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

  // the progress ber numbers
  const totalAmount =
    Number(String(studentData?.amount || "0").replace(",", ".")) || 0;

  // paid so far = on progres bar
  const paidSoFar = payments.reduce((sum, payment) => {
    const amount = Number(String(payment.amount ?? "0").replace(",", "."));
    return sum + (Number.isNaN(amount) ? 0 : amount);
  }, 0);
  const progressPercent =
    totalAmount > 0
      ? Math.min(100, Math.max(0, (paidSoFar / totalAmount) * 100))
      : 0;

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
    typeOfPaymentRaw: string | undefined
  ): PaymentPlan {
    const t = (typeOfPaymentRaw || "").toLowerCase();

    if (t.includes("year") || t.includes("roč")) return "Year";
    if (t.includes("half") || t.includes("pol")) return "Half-year";
    if (t.includes("month") || t.includes("mesa")) return "Monthly";
    //is meissing defall fallbakc?
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
    typeOfPaymentRaw: string | undefined,
    today = new Date()
  ) {
    const plan = getPlanFromStudent(typeOfPaymentRaw);
    const schoolYearStart = getSchoolYearStart(today);
    const deadlines = getDeadlinesForPlan(plan, schoolYearStart);

    const sep1 = makeDateLocal(schoolYearStart, 8, 1);
    if (today < sep1) {
      return "Ešte nemáš deadline na platbu";
    }

    const next = deadlines.find((d) => d.getTime() >= today.getTime());

    if (!next) {
      return "Jupííí, všetko uhradené";
    }

    return `Najbližší deadline: ${formatSK(next)}`;
  }

  /*
  return (
    <div className="user-profile-container">
      <div className="profile-header">
        <h1>Môj profil</h1>
        {!isEditing && (
          <button className="edit-btn" onClick={() => setIsEditing(true)}>
            Upraviť
          </button>
        )}
      </div>

      <div className="profile-card">
        {isEditing ? (
          <form className="profile-form">
            <div className="form-group">
              <label htmlFor="Name">Meno</label>
              <input id="Name" type="text" name="Name" value={editedData?.Name || ''} onChange={handleInputChange} placeholder="Vaše meno" />
            </div>
            <div className="form-group">
              <label htmlFor="Surname">Priezvisko</label>
              <input id="Surname" type="text" name="Surname" value={editedData?.Surname || ''} onChange={handleInputChange} placeholder="Vaše priezvisko" />
            </div>
            <div className="form-group">
              <label htmlFor="Region">Región</label>
              <input id="Region" type="text" name="Region" value={editedData?.Region || ''} onChange={handleInputChange} placeholder="Váš región" />
            </div>
            <div className="form-group">
              <label htmlFor="School">Škola</label>
              <input id="School" type="text" name="School" value={editedData?.School || ''} onChange={handleInputChange} placeholder="Vaša škola" />
            </div>
            <div className="form-group">
              <label htmlFor="Mail">Email</label>
              <input id="Mail" type="email" name="Mail" value={editedData?.Mail || ''} onChange={handleInputChange} placeholder="Váš email" disabled />
            </div>
            <div className="form-group">
              <label htmlFor="TelephoneNumber">Telefónne číslo</label>
              <input id="TelephoneNumber" type="tel" name="TelephoneNumber" value={editedData?.TelephoneNumber || ''} onChange={handleInputChange} placeholder="Vaše telefónne číslo" />
            </div>
            <div className="form-group">
              <label htmlFor="TypeOfPayment">Typ platby</label>
              <input id="TypeOfPayment" type="text" name="TypeOfPayment" value={editedData?.TypeOfPayment || ''} onChange={handleInputChange} placeholder="Typ platby" />
            </div>
            <div className="form-group">
              <label htmlFor="Period">Obdobie</label>
              <input id="Period" type="text" name="Period" value={editedData?.Period || ''} onChange={handleInputChange} placeholder="Obdobie" />
            </div>
            <div className="form-group">
              <label htmlFor="AMount">Suma</label>
              <input id="AMount" type="text" name="AMount" value={editedData?.AMount || ''} onChange={handleInputChange} placeholder="Suma" />
            </div>
            <div className="form-group">
              <label htmlFor="IBAN">IBAN</label>
              <input id="IBAN" type="text" name="IBAN" value={editedData?.IBAN || ''} onChange={handleInputChange} placeholder="Váš IBAN" />
            </div>
            <div className="form-group">
              <label htmlFor="VS">Variabilný symbol</label>
              <input id="VS" type="text" name="VS" value={editedData?.VS || ''} onChange={handleInputChange} placeholder="Variabilný symbol" />
            </div>
            <div className="form-group form-group-full">
              <label htmlFor="Note">Poznámka</label>
              <textarea id="Note" name="Note" value={editedData?.Note || ''} onChange={handleTextAreaChange} placeholder="Poznámka" rows={4} />
            </div>
            <div className="form-actions">
              <button type="button" className="save-btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Ukladám...' : 'Uložiť'}
              </button>
              <button type="button" className="cancel-btn" onClick={handleCancel} disabled={isSaving}>
                Zrušiť
              </button>
            </div>
          </form>
        ) : (
          <div className="profile-view">
            <div className="profile-field">
              <span className="field-label">Meno:</span>
              <span className="field-value">{studentData?.Name || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Priezvisko:</span>
              <span className="field-value">{studentData?.Surname || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Región:</span>
              <span className="field-value">{studentData?.Region || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Škola:</span>
              <span className="field-value">{studentData?.School || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Email:</span>
              <span className="field-value">{studentData?.Mail || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Telefónne číslo:</span>
              <span className="field-value">{studentData?.TelephoneNumber || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Typ platby:</span>
              <span className="field-value">{studentData?.TypeOfPayment || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Obdobie:</span>
              <span className="field-value">{studentData?.Period || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Suma:</span>
              <span className="field-value">{studentData?.AMount || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">IBAN:</span>
              <span className="field-value">{studentData?.IBAN || '-'}</span>
            </div>
            <div className="profile-field">
              <span className="field-label">Variabilný symbol:</span>
              <span className="field-value">{studentData?.VS || '-'}</span>
            </div>
            <div className="profile-field profile-field-full">
              <span className="field-label">Poznámka:</span>
              <span className="field-value">{studentData?.Note || '-'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 
*/
  return (
    <div className="user-profile-container">
      <div className="profile-grid">
        {/* PHOTO */}
        <aside className="profile-photo-card">
          <img
            className="profile-avatar"
            src={
              user?.photoURL ||
              "https://wallpapers.com/images/hd/cute-cat-eyes-profile-picture-uq3edzmg1guze2hh.jpg"
            }
            alt="Profilová fotka"
          />

          {/* PAYMENT PROGRESS */}
          <div className="payment-progress">
            <div className="progress-title">Platby</div>

            <div className="progress-info">{paidSoFar.toFixed(0)} € platených</div>

            <div className="progress-wrap">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ height: `${progressPercent}%` }}
                />
              </div>

              <div className="progress-meta">
                <div>
                  <b>{paidSoFar.toFixed(0)} €</b> zaplatené
                </div>
                <div>{totalAmount.toFixed(0)} € celkom</div>
                <div className="progress-percent">
                  {progressPercent.toFixed(0)}%
                </div>
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

            <div className="profile-field profile-field-full">
              <span className="field-label">Najbližší deadline</span>
              <span className="field-value">
                {getNextPaymentDeadlineText(studentData?.typeOfPayment)}
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
              <span className="field-value">No payments found for VS: {studentData?.vs || "-"}</span>
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
