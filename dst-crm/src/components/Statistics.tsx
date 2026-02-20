import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";

interface StudentData {
  id: string;
  name?: string;
  surname?: string;
  mail?: string;
  school?: string;
  amount?: number;
  period?: string;
}

interface PaymentInfo {
  id: string;
  vs: string;
  amount: number;
  date?: Date | null;
  matchedStudentId?: string | null;
}

interface FinanceStats {
  paid: number;
  expected: number;
  difference: number;
  final: number;
}

export const Statistics: React.FC = () => {
  const [tab, setTab] = useState<'overview' | 'finance'>('overview');
  const [students, setStudents] = useState<StudentData[]>([]);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState<string[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Načítaj študentov
      const studentsSnap = await getDocs(collection(db, "students"));
      const studentsList: StudentData[] = studentsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name ?? "",
          surname: data.surname ?? "",
          mail: data.mail ?? "",
          school: data.school ?? "",
          amount: typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0),
          period: data.period ?? "",
        };
      });

      // Načítaj platby
      const paymentsQ = query(collection(db, "payments"), orderBy("date", "desc"));
      const paymentsSnap = await getDocs(paymentsQ);
      const paymentsList: PaymentInfo[] = paymentsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          vs: data.vs ?? "",
          amount: typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0),
          date: data.date?.toDate ? data.date.toDate() : data.date ?? null,
          matchedStudentId: data.matchedStudentId ?? null,
        };
      });

      // Extrakt regióny (kraje) z údajov o školách
      const uniqueRegions = [...new Set(studentsList.map(s => s.school || "Neznámy kraj"))];
      setRegions(uniqueRegions.sort());

      setStudents(studentsList);
      setPayments(paymentsList);
    } catch (err) {
      console.error("Chyba pri načítaní štatistík:", err);
    } finally {
      setLoading(false);
    }
  };

  // Vypočítaj Finance štatistiky pre všetkých študentov
  const calculateFinanceStats = (studentIds?: string[]): FinanceStats => {
    const relevantStudents = studentIds 
      ? students.filter(s => studentIds.includes(s.id))
      : students;

    // Paid: suma všetkých platieb
    const paid = payments.reduce((acc, p) => {
      if (studentIds && p.matchedStudentId && !studentIds.includes(p.matchedStudentId)) {
        return acc;
      }
      return acc + (p.amount || 0);
    }, 0);

    // Expected: suma platieb očakávaných v danom období
    // Logika: rok začína v septembri (mesiac 9)
    // Oktober: všetci, Nov-Dec-Jan: len mesačne, Feb: mesačne+polročne, Mar-Jul: len mesačne
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    
    // Zistiť, v ktorom akademickom mesiaci sme (0 = september, 1 = október, ...)
    let academicMonth = currentMonth - 9;
    if (academicMonth <= 0) {
      academicMonth += 12; // ak sme pred septembrom, pridaj 12
    }

    let expected = 0;
    for (const student of relevantStudents) {
      const period = (student.period ?? "").toLowerCase();
      const monthlyAmount = student.amount || 0;

      if (period === "month" || period === "monthly") {
        // Mesačne sa očakáva všetky mesiace
        expected += monthlyAmount;
      } else if (period === "half-year" || period === "halfyear" || period === "half year") {
        // Polročne: február je 5. akademický mesiac
        if (academicMonth === 5) {
          expected += monthlyAmount;
        }
      } else if (period === "year" || period === "yearly") {
        // Ročne: október je 1. akademický mesiac
        if (academicMonth === 1) {
          expected += monthlyAmount;
        }
      }
    }

    // Final: celková suma ocakávaných platieb za celý akademický rok
    let final = 0;
    for (const student of relevantStudents) {
      const period = (student.period ?? "").toLowerCase();
      const monthlyAmount = student.amount || 0;

      if (period === "month" || period === "monthly") {
        final += monthlyAmount * 10; // 10 mesiacov (sept-jún ako minimálne)
      } else if (period === "half-year" || period === "halfyear" || period === "half year") {
        final += monthlyAmount * 2; // 2 platby za rok
      } else if (period === "year" || period === "yearly") {
        final += monthlyAmount * 1; // 1 platba za rok
      }
    }

    const difference = paid - expected;

    return { paid, expected, difference, final };
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-gray-600">Načítavam štatistiky...</div>;
  }

  const overallStats = calculateFinanceStats();
  const totalStudents = students.length;
  const totalPayments = payments.length;

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <h2 className="text-3xl font-bold mb-6 text-gray-900">Štatistiky</h2>

      {/* Tapy */}
      <div className="flex gap-2 mb-6 border-b-2 border-gray-200">
        <button
          className={`py-3 px-4 font-medium transition-all border-b-4 mb-[-2px] ${
            tab === 'overview'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-blue-600'
          }`}
          onClick={() => setTab('overview')}
        >
          Prehľad
        </button>
        <button
          className={`py-3 px-4 font-medium transition-all border-b-4 mb-[-2px] ${
            tab === 'finance'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-blue-600'
          }`}
          onClick={() => setTab('finance')}
        >
          Finance
        </button>
      </div>

      {/* TAB: PREHĽAD */}
      {tab === 'overview' && (
        <div className="animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-6 shadow-md hover:shadow-lg hover:translate-y-[-2px] transition-all">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Počet študentov</h3>
              <p className="text-3xl font-bold text-blue-600">{totalStudents}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 shadow-md hover:shadow-lg hover:translate-y-[-2px] transition-all">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Počet platieb</h3>
              <p className="text-3xl font-bold text-blue-600">{totalPayments}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 shadow-md hover:shadow-lg hover:translate-y-[-2px] transition-all">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Celková suma platieb</h3>
              <p className="text-3xl font-bold text-blue-600">{overallStats.paid.toFixed(2)} €</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 shadow-md hover:shadow-lg hover:translate-y-[-2px] transition-all">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Priemerná platba</h3>
              <p className="text-3xl font-bold text-blue-600">
                {totalPayments > 0 ? (overallStats.paid / totalPayments).toFixed(2) : 0} €
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: FINANCE */}
      {tab === 'finance' && (
        <div className="animate-fadeIn">
          {/* Tabuľka so všetkými štatistikami */}
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4 text-gray-900">Finančný prehľad - Celkom</h3>
            <div className="overflow-x-auto bg-white rounded-lg shadow">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Platené (Paid)</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Očakávané (Expected)</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Rozdiel (Paid - Expected)</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Celkovo očakávané (Final)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800">{overallStats.paid.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-gray-800">{overallStats.expected.toFixed(2)} €</td>
                    <td className={`px-4 py-3 font-semibold ${
                      overallStats.difference >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {overallStats.difference.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-gray-800">{overallStats.final.toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Karty podľa krajov (regiónov) */}
          <div>
            <h3 className="text-xl font-bold mb-4 text-gray-900">Finančný prehľad podľa krajov</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {regions.map((region) => {
                const regionStudents = students
                  .filter(s => s.school === region)
                  .map(s => s.id);
                const regionStats = calculateFinanceStats(regionStudents);

                return (
                  <div key={region} className="bg-white rounded-lg shadow-md hover:shadow-lg hover:translate-y-[-2px] transition-all border-l-4 border-blue-600 p-4">
                    <h4 className="text-lg font-bold text-blue-600 mb-4">{region}</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Platené:</span>
                        <span className="text-gray-900 font-semibold">{regionStats.paid.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Očakávané:</span>
                        <span className="text-gray-900 font-semibold">{regionStats.expected.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Rozdiel:</span>
                        <span className={`font-semibold ${
                          regionStats.difference >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {regionStats.difference.toFixed(2)} €
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-2">
                        <span className="text-gray-600 font-medium">Celkovo:</span>
                        <span className="text-gray-900 font-semibold">{regionStats.final.toFixed(2)} €</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-center mt-8">
            <button 
              onClick={loadStats}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-md hover:shadow-lg"
            >
              Obnoviť štatistiky
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Statistics;
