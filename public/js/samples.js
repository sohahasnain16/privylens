/**
 * Demo documents. Every identifier below is fictional (made-up CNICs, numbers
 * and addresses) — they exist so the PII detector, the router and the
 * on-device map-reduce can be shown in a few seconds.
 */

const RENT = `RENTAL AGREEMENT

This Rental Agreement is made on 1 December 2026 between Mr. Tariq Mehmood Siddiqui, holder of CNIC 42101-8765432-1, phone 0300-1234567, hereinafter "the Landlord", and Ms. Ayesha Noor, holder of CNIC 42201-1122334-5, phone +92 321 5551234, e-mail ayesha.noor@example.com, hereinafter "the Tenant".

1. Property. The Landlord rents the 2-bedroom flat no. 304, Block B, Gulshan-e-Iqbal, Karachi to the Tenant for residential use only.

2. Term and rent. The term is 11 months. Monthly rent is PKR 65,000, payable on or before the 1st of each month. A late fee of PKR 1,000 per day applies after the 3rd.

3. Security deposit. The Tenant pays an advance of 6 months' rent (PKR 390,000). The deposit will be returned within 90 days after the Tenant leaves, after deductions that the Landlord considers reasonable for damage, cleaning or repainting.

4. Rent increase. The Landlord may increase the rent by up to 25% at any time by giving 7 days' notice.

5. Termination. The Landlord may terminate this Agreement at any time with 7 days' notice. The Tenant must give 3 months' notice or forfeit the full deposit.

6. Maintenance. All repairs, including structural repairs and plumbing, are the Tenant's responsibility.

7. Entry. The Landlord may enter the flat at any time without prior notice.

8. Disputes. Any dispute will be decided by the Landlord's nominated arbitrator and the Tenant waives the right to approach any court.

Signed: ____________ Landlord        ____________ Tenant`;

const LAB = `CITY DIAGNOSTIC LABORATORY — COMPLETE BLOOD COUNT (CBC) & CHEMISTRY
Patient: Muhammad Hamza Qureshi     Age/Sex: 34 / M     MRN: 88-2031
CNIC: 42301-5566778-9     Contact: 0333-9876543
Referred by: Dr. Sana Iqbal     Report date: 21-Nov-2026

Test                 Result              Reference range
Hemoglobin           9.1 g/dL            13.0 - 17.0       LOW
RBC count            3.9 million/uL      4.5 - 5.5         LOW
MCV                  72 fL               80 - 100          LOW
WBC count            7,400 /uL           4,000 - 11,000
Platelets            455,000 /uL         150,000 - 410,000 HIGH
Ferritin             8 ng/mL             30 - 400          LOW
Fasting glucose      104 mg/dL           70 - 99           HIGH

Clinical note: Findings may suggest an iron-deficiency pattern. Clinical correlation is advised.`;

const SCAM = `From: HBL-Alert <support@hbl-secure-verify.com>

URGENT!! Dear customer, your account number 0123-4567-8901 will be BLOCKED within 2 hours due to incomplete KYC. Verify now at http://hbl-kyc-update.xyz/login and send your CNIC 42101-9988776-5 together with the OTP we sent to 0345-1112223. If you do not reply, your account will be permanently closed and a penalty of PKR 25,000 will be charged. Do not visit the branch. This is an automated message.`;

const URDU = `محترم صارف، آپ کے اکاؤنٹ نمبر 0400123456 پر 18,450 روپے کا بل بقایا ہے۔ اگر ادائیگی 30 نومبر تک نہ کی گئی تو 2,500 روپے لیٹ پیمنٹ چارجز لگیں گے اور کنکشن منقطع کر دیا جائے گا۔ مزید معلومات کے لیے ہمارے نمائندے سے 0321-5551234 پر رابطہ کریں۔ شناختی کارڈ نمبر: 42201-1122334-5`;

// ---- A deliberately long contract: forces on-device map-reduce ------------
const CORE_CLAUSES = [
  "1. Membership. This Membership Agreement is between FitZone Fitness (Pvt) Ltd (\"FitZone\") and the member named on the application form. Membership is personal and cannot be transferred, shared or sold to anybody else, including family members, without written permission from FitZone management.",
  "2. Access. Members may use all FitZone branches during staffed hours. Entry requires the membership card or the mobile app. A replacement card costs PKR 1,500. Members must scan in at every visit, and unscanned visits are not counted for any loyalty reward.",
  "3. Fees. The monthly fee is PKR 8,500 and is charged on the 1st of every month by direct debit or card. A one-time joining fee of PKR 10,000 is charged at signing. FitZone may revise monthly fees once every six months with 14 days' notice by SMS or in the app.",
  "4. Late and failed payments. If a payment fails, a fee of PKR 2,000 is added and access may be suspended until the balance is cleared. Accounts that remain unpaid for 30 days are sent to a collection agent, and collection costs are added to the amount owed.",
  "5. Health declaration. The member confirms that they are medically fit to exercise and will tell FitZone about any condition that may affect training. FitZone is not responsible for injuries caused by the member's failure to disclose a condition or by misuse of equipment.",
  "6. Safety and conduct. Members must wipe down equipment, wear proper footwear, and follow staff instructions. Photography and filming of other members is forbidden. FitZone may cancel a membership immediately, without refund, for abusive behaviour or breach of safety rules.",
  "7. Personal trainers. Sessions with personal trainers are sold separately in packs of ten. Unused sessions expire after 60 days and are not refundable. Trainers may be changed by FitZone without notice.",
  "8. Freezing. A membership may be frozen for up to 60 days per year with a medical certificate. A freeze fee of PKR 1,000 per month applies, and freezing does not extend the contract end date.",
  "9. Term, renewal and cancellation. The initial term is 12 months. Unless the member gives written notice by registered post at least 45 days before the end of the term, the membership renews automatically for another 12 months at the then-current price, and the renewal fee for the full year is charged in advance. Cancelling in the middle of a term requires payment of 60% of the remaining months, plus an administrative fee of PKR 5,000. Cancellation by phone, e-mail or in the app is not valid.",
  "10. Lockers and belongings. Day lockers are free; permanent lockers cost PKR 1,200 per month. FitZone is not responsible for lost, stolen or damaged belongings, and may cut locks on lockers left in use after closing time. Items left behind are discarded after 7 days.",
  "11. Data. FitZone may use the member's contact details, attendance records and photographs taken at entry to run the club, send offers and share information with partner companies. Members who do not want marketing messages must write to the head office.",
  "12. Liability and disputes. To the maximum extent permitted by law, FitZone is not liable for any loss, injury or damage, even if caused by its negligence. Any dispute will be settled by arbitration chosen by FitZone in Lahore, and the member gives up the right to join any group claim.",
];

const BRANCHES = [
  ["Gulshan", "6am-11pm", 2, 1200, 150], ["Clifton", "5am-12am", 4, 1500, 200], ["DHA Phase 6", "5am-12am", 4, 1500, 200],
  ["North Nazimabad", "6am-10pm", 2, 1000, 100], ["Saddar", "7am-9pm", 1, 800, 100], ["Johar", "6am-11pm", 2, 1100, 150],
  ["Bahria Town", "6am-11pm", 3, 1300, 150], ["Model Town", "6am-10pm", 2, 1200, 120], ["Gulberg", "5am-12am", 4, 1600, 220],
  ["F-7 Islamabad", "5am-11pm", 3, 1500, 200], ["Blue Area", "6am-10pm", 2, 1400, 180], ["University Road", "7am-10pm", 1, 900, 100],
  ["Malir", "7am-9pm", 1, 800, 80], ["Korangi", "7am-9pm", 1, 800, 80], ["Defence Lahore", "5am-12am", 4, 1600, 220],
  ["Peshawar Cantt", "6am-10pm", 2, 1100, 130], ["Hyderabad", "7am-9pm", 1, 900, 90], ["Faisalabad", "6am-10pm", 2, 1000, 110],
].map(([name, hours, guests, locker, towel], i) =>
  `Schedule ${String.fromCharCode(65 + (i % 26))}${i + 1} — ${name} branch rules. Opening hours are ${hours}. Each member may bring ${guests} guest pass${guests > 1 ? "es" : ""} per month; extra guests pay PKR 600 per visit. Permanent lockers at this branch cost PKR ${locker} per month and towel service costs PKR ${towel} per use. The branch is closed on Eid days and during national holidays, and the pool and sauna may close for maintenance without notice. Classes at ${name} are first-come, first-served and a no-show twice in one month removes class booking rights until the next month.`);

const LONG = [...CORE_CLAUSES.slice(0, 8), ...BRANCHES.slice(0, 9), ...CORE_CLAUSES.slice(8), ...BRANCHES.slice(9)].join("\n\n");

export const SAMPLES = [
  { id: "rent", label: "Rental agreement (PII + unfair clauses)", language: "en", text: RENT },
  { id: "lab", label: "Lab report (medical, private)", language: "en", text: LAB },
  { id: "scam", label: "Bank SMS (phishing check)", language: "en", text: SCAM },
  { id: "long", label: "Long gym contract (≈13k chars → on-device map-reduce)", language: "en", text: LONG },
  { id: "urdu", label: "اردو بل نوٹس (Urdu → cloud with masking)", language: "ur", text: URDU },
];
