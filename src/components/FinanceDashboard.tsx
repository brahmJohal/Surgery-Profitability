import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { importReconciliationFile } from "../lib/excelImport";
import { loadFinanceWorkspace, replaceFinanceWorkspaceCollection } from "../services/financeWorkspaceService";
import { supabase } from "../lib/supabase";

type PayableStatus = "submitted" | "approved" | "paid" | "on_hold";
type ConfirmAction = "delete_payee" | "delete_agreement" | "clear_unpaid_queue";
type DeductionKey =
  | "dci"
  | "cross_consultation"
  | "referral_commission"
  | "external_lab"
  | "external_diagnostics"
  | "anaesthetist"
  | "assistant_surgeon"
  | "consumables"
  | "special_equipment"
  | "external_visit"
  | "implant"
  | "b2b_partner_payout"
  | "blood_procurement"
  | "corporate_discount_adjustment"
  | "custom_payout"
  | "emi_reimbursement_cost"
  | "medical_equipment_rental"
  | "outside_lab_payout"
  | "referral_payout"
  | "surgeon_payout"
  | "visiting_consultant_fee";

const deductionOptions: { key: DeductionKey; label: string }[] = [
  { key: "dci", label: "DCI" },
  { key: "cross_consultation", label: "Cross-consultation" },
  { key: "referral_commission", label: "Referral commission" },
  { key: "external_lab", label: "External lab" },
  { key: "external_diagnostics", label: "External diagnostics / ultrasound" },
  { key: "anaesthetist", label: "Anaesthetist payout" },
  { key: "assistant_surgeon", label: "Assistant surgeon payout" },
  { key: "consumables", label: "Consumables" },
  { key: "special_equipment", label: "Special rented equipment" },
  { key: "external_visit", label: "External doctor visit cost" },
  { key: "implant", label: "Implant cost — hospital" },
  { key: "b2b_partner_payout", label: "B2B partner payout (Carelane, Hexa, Practo, Surgenix etc.)" },
  { key: "blood_procurement", label: "Blood procurement" },
  { key: "corporate_discount_adjustment", label: "Corporate discount adjustment" },
  { key: "custom_payout", label: "Custom payout" },
  { key: "emi_reimbursement_cost", label: "EMI / reimbursement cost (finance partner payout)" },
  { key: "medical_equipment_rental", label: "Medical equipment rental — patient" },
  { key: "outside_lab_payout", label: "Outside lab payout" },
  { key: "referral_payout", label: "Referral payout" },
  { key: "surgeon_payout", label: "Surgeon payout" },
  { key: "visiting_consultant_fee", label: "Visiting consultant fee" },
];
type SurgeryFee = {
  id: string;
  surgeryName: string;
  surgeonFee: number;
};
type SharingTerms = {
  enabled: boolean;
  percentage: number;
  revenueBasis: ReconciliationRule["revenueBasis"];
  deductions: DeductionKey[];
};
type ConsolidatedTerms = {
  doctorPatient: SharingTerms;
  hospitalPatient: SharingTerms;
  referralCash: SharingTerms;
  referralInsurance: SharingTerms;
  partnerPatientAndDoctor: SharingTerms;
  partnerPatientOnly: SharingTerms;
  defaultPartnerTerms: "partner_patient_and_doctor" | "partner_patient_only";
  assistantSurgeon: SharingTerms;
  anaesthetistEnabled: boolean;
  anaesthesiaFirstHourRate: number;
  anaesthesiaAdditionalHourRate: number;
  hospitalSurgeonFees: SurgeryFee[];
};
type Payable = {
  id: string;
  payee: string;
  type: string;
  caseRef: string;
  gross: number;
  tds: number;
  status: PayableStatus;
  bank: string;
  eligibleRevenue?: number;
  excludedCosts?: number;
  percentage?: number;
  ruleSource?: "mou" | "basic";
  patientName?: string;
  patientPhone?: string;
  uhid?: string;
  hospitalName?: string;
  admissionDate?: string;
  dischargeDate?: string;
  totalRevenue?: number;
  totalExpense?: number;
  reportedProfit?: number;
  surgeryName?: string;
  patientSource?: string;
  caseType?: string;
  partnerType?: string;
  anaesthesiaHours?: number;
  deductionAmounts?: Partial<Record<DeductionKey, number>>;
};
type ReconciliationRule = {
  id: string;
  payee: string;
  role: string;
  referralCaseType: "cash" | "insurance";
  anaesthesiaFirstHourRate: number;
  anaesthesiaAdditionalHourRate: number;
  partnerType: "partner_patient_and_doctor" | "partner_patient_only";
  patientSource: "doctor_patient" | "hospital_patient";
  payoutMethod: "percentage" | "surgeon_fee";
  surgeonFee: number;
  surgeryFees: SurgeryFee[];
  revenueBasis: "billed" | "settled_tpa" | "payment_received" | "remaining_amount" | "partner_commission" | "fixed";
  percentage: number;
  selectedDeductions: DeductionKey[];
  deductExternalLab: boolean;
  deductImplant: boolean;
  deductDci: boolean;
  deductCrossConsultation: boolean;
  deductReferralCommission: boolean;
  deductExternalDiagnostics: boolean;
  deductAnaesthetist: boolean;
  deductConsumables: boolean;
  deductSpecialEquipment: boolean;
  deductExternalVisit: boolean;
  opdSharePercentage: number;
  opdPrice: number;
  fixedRental: number;
  fixedMonthlyAmount: number;
  effectiveFrom: string;
  effectiveTo: string;
  wardVisitCharge: number;
  icuEmergencyVisitCharge: number;
  paymentTerms: string;
  notes: string;
  consolidatedTerms?: ConsolidatedTerms;
  mouFileName?: string;
  mouUploadedAt?: string;
};
const emptySharingTerms = (): SharingTerms => ({
  enabled: false,
  percentage: 0,
  revenueBasis: "remaining_amount",
  deductions: [],
});
const emptyConsolidatedTerms = (): ConsolidatedTerms => ({
  doctorPatient: { ...emptySharingTerms(), enabled: true },
  hospitalPatient: emptySharingTerms(),
  referralCash: emptySharingTerms(),
  referralInsurance: emptySharingTerms(),
  partnerPatientAndDoctor: emptySharingTerms(),
  partnerPatientOnly: emptySharingTerms(),
  defaultPartnerTerms: "partner_patient_only",
  assistantSurgeon: emptySharingTerms(),
  anaesthetistEnabled: false,
  anaesthesiaFirstHourRate: 0,
  anaesthesiaAdditionalHourRate: 0,
  hospitalSurgeonFees: [],
});
type PayableGroup = {
  key: string;
  payee: string;
  type: string;
  items: Payable[];
  gross: number;
  tds: number;
  status: PayableStatus;
};
type PayeeProfile = {
  name: string;
  category: string;
  pan: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  upi: string;
};
type UpiPayment = {
  payee: string;
  upi: string;
  amount: number;
  qrImage: string;
  upiLink: string;
};

const savedPayables = (): Payable[] =>
  JSON.parse(localStorage.getItem("financePayables") || "[]");
const savedPayeeProfiles = (): PayeeProfile[] =>
  JSON.parse(localStorage.getItem("financePayeeProfiles") || "[]");
const emptyRule: ReconciliationRule = {
  id: "",
  payee: "",
  role: "Doctor",
  referralCaseType: "cash",
  anaesthesiaFirstHourRate: 0,
  anaesthesiaAdditionalHourRate: 0,
  partnerType: "partner_patient_and_doctor",
  patientSource: "doctor_patient",
  payoutMethod: "percentage",
  surgeonFee: 0,
  surgeryFees: [],
  revenueBasis: "remaining_amount",
  percentage: 20,
  selectedDeductions: ["external_lab", "implant"],
  deductExternalLab: true,
  deductImplant: true,
  deductDci: false,
  deductCrossConsultation: false,
  deductReferralCommission: false,
  deductExternalDiagnostics: false,
  deductAnaesthetist: false,
  deductConsumables: false,
  deductSpecialEquipment: false,
  deductExternalVisit: false,
  opdSharePercentage: 0,
  opdPrice: 0,
  fixedRental: 0,
  fixedMonthlyAmount: 0,
  effectiveFrom: "",
  effectiveTo: "",
  wardVisitCharge: 0,
  icuEmergencyVisitCharge: 0,
  paymentTerms: "",
  notes: "",
  consolidatedTerms: emptyConsolidatedTerms(),
};
const savedRules = (): ReconciliationRule[] =>
  JSON.parse(localStorage.getItem("financeReconciliationRules") || "[]").map(
    (rule: Partial<ReconciliationRule>) => ({
      ...emptyRule,
      ...rule,
      selectedDeductions: Array.isArray(rule.selectedDeductions)
        ? rule.selectedDeductions
        : deductionOptions
            .filter(({ key }) => {
              const legacy: Partial<Record<DeductionKey, boolean>> = {
                dci: rule.deductDci,
                cross_consultation: rule.deductCrossConsultation,
                referral_commission: rule.deductReferralCommission,
                external_lab: rule.deductExternalLab,
                external_diagnostics: rule.deductExternalDiagnostics,
                anaesthetist: rule.deductAnaesthetist,
                consumables: rule.deductConsumables,
                special_equipment: rule.deductSpecialEquipment,
                external_visit: rule.deductExternalVisit,
                implant: rule.deductImplant,
              };
              return legacy[key];
            })
            .map(({ key }) => key),
    }),
  );
const emptyPayeeProfile: PayeeProfile = {
  name: "",
  category: "Doctor",
  pan: "",
  accountHolder: "",
  accountNumber: "",
  ifsc: "",
  upi: "",
};

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
const formatDateTime = (value?: string) => {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const allowedMouFileTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function FinanceDashboard() {
  const [payables, setPayables] = useState<Payable[]>(savedPayables);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "queue" | "agreements" | "history" | "bank"
  >("dashboard");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [expandedPayees, setExpandedPayees] = useState<string[]>([]);
  const [payeeProfiles, setPayeeProfiles] =
    useState<PayeeProfile[]>(savedPayeeProfiles);
  const [payeeForm, setPayeeForm] = useState<PayeeProfile>(emptyPayeeProfile);
  const [payeeModalOpen, setPayeeModalOpen] = useState(false);
  const [rules, setRules] = useState<ReconciliationRule[]>(savedRules);
  const [ruleForm, setRuleForm] = useState<ReconciliationRule>(emptyRule);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [upiPayment, setUpiPayment] = useState<UpiPayment | null>(null);
  const [caseDetails, setCaseDetails] = useState<Payable | null>(null);
  const mouInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void loadFinanceWorkspace()
      .then((workspace) => {
        if (!active || !workspace) return;
        const remoteHasData = workspace.rules.length || workspace.profiles.length || workspace.payables.length;
        if (remoteHasData) {
          setRules(workspace.rules as ReconciliationRule[]);
          setPayeeProfiles(workspace.profiles as PayeeProfile[]);
          setPayables(workspace.payables as Payable[]);
        } else {
          const localRules = savedRules();
          const localProfiles = savedPayeeProfiles();
          const localPayables = savedPayables();
          if (localRules.length || localProfiles.length || localPayables.length) {
            void Promise.all([
              replaceFinanceWorkspaceCollection("rules", localRules),
              replaceFinanceWorkspaceCollection("profiles", localProfiles),
              replaceFinanceWorkspaceCollection("payables", localPayables),
            ])
              .then(() => {
                localStorage.removeItem("financeReconciliationRules");
                localStorage.removeItem("financePayeeProfiles");
                localStorage.removeItem("financePayables");
                if (active) setMessage("Finance data moved securely to Supabase.");
              })
              .catch((error: unknown) => {
                const detail = error && typeof error === "object" && "message" in error
                  ? String(error.message)
                  : "Unknown Supabase error";
                if (active) setMessage(`Finance sync failed: ${detail}`);
              });
          }
        }
      })
      .catch(() => {
        if (active) setMessage("Could not load protected Finance data. Confirm that migration 007 has been run in Supabase.");
      });
    return () => { active = false; };
  }, []);
  const savePayables = (next: Payable[]) => {
    setPayables(next);
    if (!supabase) {
      localStorage.setItem("financePayables", JSON.stringify(next));
      return;
    }
    void replaceFinanceWorkspaceCollection("payables", next).catch(() => {
      setMessage("Could not save protected payout data. Please try again.");
    });
  };
  const saveRules = (next: ReconciliationRule[]) => {
    setRules(next);
    if (!supabase) {
      localStorage.setItem("financeReconciliationRules", JSON.stringify(next));
      return;
    }
    void replaceFinanceWorkspaceCollection("rules", next).catch(() => {
      setMessage("Could not save protected MOU data. Please try again.");
    });
  };
  const savePayeeProfiles = (next: PayeeProfile[]) => {
    setPayeeProfiles(next);
    if (!supabase) {
      localStorage.setItem("financePayeeProfiles", JSON.stringify(next));
      return;
    }
    void replaceFinanceWorkspaceCollection("profiles", next).catch(() => {
      setMessage("Could not save protected payee details. Please try again.");
    });
  };
  const addSurgeryFee = () => {
    setRuleForm((current) => ({
      ...current,
      surgeryFees: [
        ...current.surgeryFees,
        { id: `SURGERY-${Date.now()}`, surgeryName: "", surgeonFee: 0 },
      ],
    }));
  };
  const addDeduction = (value: string) => {
    if (!value) return;
    if (value === "all") {
      setRuleForm((current) => ({
        ...current,
        selectedDeductions: deductionOptions.map((option) => option.key),
      }));
      return;
    }
    const deduction = value as DeductionKey;
    setRuleForm((current) =>
      current.selectedDeductions.includes(deduction)
        ? current
        : {
            ...current,
            selectedDeductions: [...current.selectedDeductions, deduction],
          },
    );
  };
  const removeDeduction = (deduction: DeductionKey) => {
    setRuleForm((current) => ({
      ...current,
      selectedDeductions: current.selectedDeductions.filter(
        (item) => item !== deduction,
      ),
    }));
  };
  const updateConsolidatedTerm = (
    key: keyof Pick<ConsolidatedTerms, "doctorPatient" | "hospitalPatient" | "referralCash" | "referralInsurance" | "partnerPatientAndDoctor" | "partnerPatientOnly" | "assistantSurgeon">,
    update: Partial<SharingTerms>,
  ) => {
    setRuleForm((current) => ({
      ...current,
      consolidatedTerms: {
        ...(current.consolidatedTerms || emptyConsolidatedTerms()),
        [key]: {
          ...(current.consolidatedTerms || emptyConsolidatedTerms())[key],
          ...update,
        },
      },
    }));
  };
  const updateConsolidatedDeductions = (
    key: keyof Pick<ConsolidatedTerms, "doctorPatient" | "hospitalPatient" | "referralCash" | "referralInsurance" | "partnerPatientAndDoctor" | "partnerPatientOnly" | "assistantSurgeon">,
    value: string,
  ) => {
    if (!value) return;
    const current = ruleForm.consolidatedTerms || emptyConsolidatedTerms();
    const deductions = value === "all"
      ? deductionOptions.map((option) => option.key)
      : [...new Set([...current[key].deductions, value as DeductionKey])];
    updateConsolidatedTerm(key, { deductions });
  };
  const consolidatedTerms = ruleForm.consolidatedTerms || emptyConsolidatedTerms();
  const removeConsolidatedDeduction = (
    key: keyof Pick<ConsolidatedTerms, "doctorPatient" | "hospitalPatient" | "referralCash" | "referralInsurance" | "partnerPatientAndDoctor" | "partnerPatientOnly" | "assistantSurgeon">,
    deduction: DeductionKey,
  ) => updateConsolidatedTerm(key, {
    deductions: consolidatedTerms[key].deductions.filter((item) => item !== deduction),
  });
  const updateConsolidatedTerms = (update: Partial<ConsolidatedTerms>) => {
    setRuleForm((current) => ({
      ...current,
      consolidatedTerms: {
        ...(current.consolidatedTerms || emptyConsolidatedTerms()),
        ...update,
      },
    }));
  };
  const addConsolidatedSurgeryFee = () => updateConsolidatedTerms({
    hospitalSurgeonFees: [
      ...consolidatedTerms.hospitalSurgeonFees,
      { id: `SURGERY-${Date.now()}`, surgeryName: "", surgeonFee: 0 },
    ],
  });
  const updateConsolidatedSurgeryFee = (
    id: string,
    field: "surgeryName" | "surgeonFee",
    value: string | number,
  ) => updateConsolidatedTerms({
    hospitalSurgeonFees: consolidatedTerms.hospitalSurgeonFees.map((item) =>
      item.id === id ? { ...item, [field]: value } : item,
    ),
  });
  const removeConsolidatedSurgeryFee = (id: string) => updateConsolidatedTerms({
    hospitalSurgeonFees: consolidatedTerms.hospitalSurgeonFees.filter((item) => item.id !== id),
  });
  const updateSurgeryFee = (
    id: string,
    field: "surgeryName" | "surgeonFee",
    value: string | number,
  ) => {
    setRuleForm((current) => ({
      ...current,
      surgeryFees: current.surgeryFees.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };
  const removeSurgeryFee = (id: string) => {
    setRuleForm((current) => ({
      ...current,
      surgeryFees: current.surgeryFees.filter((item) => item.id !== id),
    }));
  };
  const totals = useMemo(
    () => ({
      submitted: payables
        .filter((item) => item.status === "submitted")
        .reduce((sum, item) => sum + item.gross - item.tds, 0),
      approved: payables
        .filter((item) => item.status === "approved")
        .reduce((sum, item) => sum + item.gross - item.tds, 0),
      paid: payables
        .filter((item) => item.status === "paid")
        .reduce((sum, item) => sum + item.gross - item.tds, 0),
    }),
    [payables],
  );
  const payableGroups = useMemo<PayableGroup[]>(() => {
    const groups = new Map<string, Payable[]>();
    payables.forEach((item) => {
      const key = item.payee.trim().toLowerCase();
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    return [...groups.entries()].map(([key, items]) => ({
      key,
      payee: items[0].payee,
      type: items[0].type,
      items,
      gross: items.reduce((sum, item) => sum + item.gross, 0),
      tds: items.reduce((sum, item) => sum + item.tds, 0),
      status: items.every((item) => item.status === "paid")
        ? "paid"
        : items.every((item) => item.status === "approved")
          ? "approved"
          : "submitted",
    }));
  }, [payables]);
  const unpaidPayableGroups = useMemo(
    () =>
      payableGroups.flatMap((group) => {
        const items = group.items.filter((item) => item.status !== "paid");
        if (!items.length) return [];
        return [
          {
            ...group,
            items,
            gross: items.reduce((sum, item) => sum + item.gross, 0),
            tds: items.reduce((sum, item) => sum + item.tds, 0),
            status: items.every((item) => item.status === "approved")
              ? "approved"
              : ("submitted" as PayableStatus),
          },
        ];
      }),
    [payableGroups],
  );
  const vendorDirectory = useMemo(() => {
    const imported = payableGroups.map((group) => ({
      name: group.payee,
      category: [...new Set(group.items.map((item) => item.type))].join(", "),
    }));
    const manualOnly = payeeProfiles.filter(
      (profile) =>
        !imported.some(
          (item) =>
            item.name.trim().toLowerCase() ===
            profile.name.trim().toLowerCase(),
        ),
    );
    return [...imported, ...manualOnly].map((item) => ({
      ...item,
      profile: payeeProfiles.find(
        (profile) =>
          profile.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      ),
    }));
  }, [payableGroups, payeeProfiles]);

  const changeStatus = (id: string, status: PayableStatus) => {
    savePayables(
      payables.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setMessage(
      status === "approved"
        ? "Payment approved for the next Monday run."
        : "Payment marked as paid. Add the bank reference when the gateway is connected.",
    );
  };

  const changeGroupStatus = (items: Payable[], status: PayableStatus) => {
    const ids = new Set(items.map((item) => item.id));
    savePayables(
      payables.map((item) => (ids.has(item.id) ? { ...item, status } : item)),
    );
    setMessage(
      status === "paid"
        ? `${items[0].payee}'s ${items.length} surgery payout${items.length === 1 ? "" : "s"} marked as paid and removed from Monday's total.`
        : "Payment approved for the next Monday run.",
    );
  };

  const requestClearUnpaidQueue = () => {
    if (payables.some((item) => item.status !== "paid")) {
      setConfirmAction("clear_unpaid_queue");
    }
  };

  const clearUnpaidQueue = () => {
    const removed = payables.filter((item) => item.status !== "paid").length;
    savePayables(payables.filter((item) => item.status === "paid"));
    setMessage(
      `${removed} unpaid payout${removed === 1 ? "" : "s"} removed from the payment queue. Paid history was kept.`,
    );
  };

  const openUpiQr = async (group: PayableGroup) => {
    const profile = payeeProfiles.find(
      (item) => item.name.trim().toLowerCase() === group.payee.trim().toLowerCase(),
    );
    if (!profile?.upi.trim()) {
      setMessage(`Add a UPI ID to ${group.payee}'s MOU before creating a payment QR.`);
      return;
    }
    const amount = Math.max(0, group.gross - group.tds);
    const parameters = new URLSearchParams({
      pa: profile.upi.trim(),
      pn: group.payee,
      am: amount.toFixed(2),
      cu: "INR",
      tn: `Hospital payout - ${group.payee}`,
    });
    const upiLink = `upi://pay?${parameters.toString()}`;
    const qrImage = await QRCode.toDataURL(upiLink, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    setUpiPayment({ payee: group.payee, upi: profile.upi.trim(), amount, qrImage, upiLink });
  };

  const togglePayee = (key: string) =>
    setExpandedPayees((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  const savePayeeProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = payeeForm.name.trim();
    if (!name) {
      setMessage("Enter a vendor or payee name.");
      return;
    }
    const profile = {
      ...payeeForm,
      name,
      pan: payeeForm.pan.toUpperCase(),
      ifsc: payeeForm.ifsc.toUpperCase(),
    };
    const next = [
      ...payeeProfiles.filter(
        (item) => item.name.toLowerCase() !== name.toLowerCase(),
      ),
      profile,
    ];
    savePayeeProfiles(next);
    setPayeeForm(emptyPayeeProfile);
    setPayeeModalOpen(false);
    setMessage(`Details saved for ${name}.`);
  };
  const editPayee = (name: string, category: string) => {
    setPayeeForm(
      payeeProfiles.find(
        (item) => item.name.trim().toLowerCase() === name.trim().toLowerCase(),
      ) || { ...emptyPayeeProfile, name, category },
    );
    setPayeeModalOpen(true);
  };
  const addPayee = () => {
    setPayeeForm(emptyPayeeProfile);
    setPayeeModalOpen(true);
  };
  const requestDeletePayee = () => {
    const name = payeeForm.name.trim();
    if (!name) return;
    setConfirmAction("delete_payee");
  };
  const deletePayee = () => {
    const name = payeeForm.name.trim();
    if (!name) return;
    const nextProfiles = payeeProfiles.filter(
      (profile) => profile.name.toLowerCase() !== name.toLowerCase(),
    );
    const nextPayables = payables.filter(
      (payable) => payable.payee.trim().toLowerCase() !== name.toLowerCase(),
    );
    const nextRules = rules.filter(
      (rule) => rule.payee.trim().toLowerCase() !== name.toLowerCase(),
    );
    savePayeeProfiles(nextProfiles);
    savePayables(nextPayables);
    saveRules(nextRules);
    setPayeeModalOpen(false);
    setMessage(`${name} and all associated Finance records were deleted.`);
  };

  const openRule = (rule?: ReconciliationRule) => {
    const legacyTerms = emptyConsolidatedTerms();
    if (rule && !rule.consolidatedTerms) {
      const legacyShare: SharingTerms = {
        enabled: rule.role !== "Anaesthetist",
        percentage: rule.percentage,
        revenueBasis: rule.revenueBasis,
        deductions: rule.selectedDeductions || [],
      };
      if (rule.role === "Doctor") {
        if (rule.patientSource === "doctor_patient") legacyTerms.doctorPatient = legacyShare;
        else legacyTerms.hospitalPatient = legacyShare;
        legacyTerms.hospitalSurgeonFees = rule.surgeryFees || [];
      }
      if (rule.role === "Referral") {
        if (rule.referralCaseType === "cash") legacyTerms.referralCash = legacyShare;
        else legacyTerms.referralInsurance = legacyShare;
      }
      if (rule.role === "Partner") {
        if (rule.partnerType === "partner_patient_and_doctor") legacyTerms.partnerPatientAndDoctor = legacyShare;
        else legacyTerms.partnerPatientOnly = legacyShare;
      }
      if (rule.role === "Assistant Surgeon") legacyTerms.assistantSurgeon = legacyShare;
      if (rule.role === "Anaesthetist") {
        legacyTerms.anaesthetistEnabled = true;
        legacyTerms.anaesthesiaFirstHourRate = rule.anaesthesiaFirstHourRate;
        legacyTerms.anaesthesiaAdditionalHourRate = rule.anaesthesiaAdditionalHourRate;
      }
    }
    setRuleForm(
      rule
        ? {
            ...emptyRule,
            ...rule,
            consolidatedTerms: rule.consolidatedTerms || legacyTerms,
            surgeryFees:
              rule.surgeryFees?.length
                ? rule.surgeryFees
                : rule.surgeonFee
                  ? [
                      {
                        id: `SURGERY-${Date.now()}`,
                        surgeryName: "Default surgeon fee",
                        surgeonFee: rule.surgeonFee,
                      },
                    ]
                  : [],
          }
        : { ...emptyRule, id: `RULE-${Date.now()}`, consolidatedTerms: emptyConsolidatedTerms() },
    );
    const payeeName = rule?.payee || "";
    setPayeeForm(
      payeeProfiles.find(
        (profile) => profile.name.trim().toLowerCase() === payeeName.trim().toLowerCase(),
      ) || { ...emptyPayeeProfile, name: payeeName, category: rule?.role || "Doctor" },
    );
    setRuleModalOpen(true);
  };
  const recalculatePendingPayables = (rule: ReconciliationRule) => {
    const terms = rule.consolidatedTerms;
    let updatedCount = 0;
    const nextPayables = payables.map((item) => {
      if (
        item.status === "paid" ||
        item.payee.trim().toLowerCase() !== rule.payee.trim().toLowerCase() ||
        item.type.toLowerCase() !== rule.role.toLowerCase()
      ) return item;

      const patientSource = item.patientSource?.toLowerCase().includes("doctor")
        ? "doctor_patient"
        : "hospital_patient";
      const isInsurance = /insurance|tpa/i.test(item.caseType || "");
      const isPartnerBoth = item.partnerType
        ? /doctor|both/i.test(item.partnerType)
        : terms?.defaultPartnerTerms === "partner_patient_and_doctor";
      const preferredShare = terms
        ? rule.role === "Doctor" ? patientSource === "doctor_patient" ? terms.doctorPatient : terms.hospitalPatient
          : rule.role === "Referral" ? isInsurance ? terms.referralInsurance : terms.referralCash
          : rule.role === "Partner" ? isPartnerBoth ? terms.partnerPatientAndDoctor : terms.partnerPatientOnly
          : rule.role === "Assistant Surgeon" ? terms.assistantSurgeon
          : undefined
        : undefined;
      const alternateShare = terms
        ? rule.role === "Referral" ? isInsurance ? terms.referralCash : terms.referralInsurance
          : rule.role === "Partner" ? isPartnerBoth ? terms.partnerPatientOnly : terms.partnerPatientAndDoctor
          : undefined
        : undefined;
      const share = preferredShare?.enabled ? preferredShare : alternateShare?.enabled ? alternateShare : undefined;
      const selectedDeductions = share?.deductions || rule.selectedDeductions || [];
      const hasSourceDeductions = Boolean(item.deductionAmounts);
      const excludedCosts = hasSourceDeductions
        ? selectedDeductions.reduce(
            (sum, key) => sum + (item.deductionAmounts?.[key] || 0),
            0,
          )
        : item.excludedCosts || 0;
      const baseRevenue = item.totalRevenue ?? (item.eligibleRevenue || 0) + (item.excludedCosts || 0);
      const eligibleRevenue = hasSourceDeductions
        ? Math.max(0, baseRevenue - excludedCosts)
        : item.eligibleRevenue || 0;
      const percentage = share?.percentage ?? rule.percentage;
      let gross = eligibleRevenue * (percentage / 100);
      if (rule.role === "Anaesthetist" && terms?.anaesthetistEnabled) {
        gross = terms.anaesthesiaFirstHourRate + Math.max(0, Math.ceil((item.anaesthesiaHours || 1) - 1)) * terms.anaesthesiaAdditionalHourRate;
      } else if (rule.role === "Doctor" && patientSource === "hospital_patient" && terms?.hospitalSurgeonFees.length) {
        gross = terms.hospitalSurgeonFees.find(
          (fee) => fee.surgeryName.trim().toLowerCase() === item.surgeryName?.trim().toLowerCase(),
        )?.surgeonFee ?? gross;
      }
      updatedCount += 1;
      return { ...item, gross, eligibleRevenue, excludedCosts, percentage, ruleSource: "mou" as const };
    });
    if (updatedCount) savePayables(nextPayables);
    return updatedCount;
  };
  const saveRule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payee = ruleForm.payee.trim();
    const terms = ruleForm.consolidatedTerms || emptyConsolidatedTerms();
    const shares = [terms.doctorPatient, terms.hospitalPatient, terms.referralCash, terms.referralInsurance, terms.partnerPatientAndDoctor, terms.partnerPatientOnly, terms.assistantSurgeon];
    const hasTerms = shares.some((term) => term.enabled && term.percentage > 0) || terms.anaesthetistEnabled || terms.hospitalSurgeonFees.length > 0;
    const invalidShare = shares.some((term) => term.enabled && (term.percentage < 0 || term.percentage > 100));
    const invalidSurgeonFee = terms.hospitalSurgeonFees.some((item) => !item.surgeryName.trim() || item.surgeonFee <= 0);
    if (!payee || !hasTerms || invalidShare || invalidSurgeonFee || (terms.anaesthetistEnabled && (terms.anaesthesiaFirstHourRate <= 0 || terms.anaesthesiaAdditionalHourRate < 0))) {
      setMessage("Enter a payee and at least one valid payout term.");
      return;
    }
    const nextRule = {
      ...ruleForm,
      payee,
      consolidatedTerms: terms,
      surgeryFees: terms.hospitalSurgeonFees,
      surgeonFee: terms.hospitalSurgeonFees[0]?.surgeonFee || 0,
    };
    saveRules([...rules.filter((rule) => rule.id !== nextRule.id), nextRule]);
    const recalculated = recalculatePendingPayables(nextRule);
    const profile = {
      ...payeeForm,
      name: payee,
      category: ruleForm.role,
      pan: payeeForm.pan.toUpperCase(),
      ifsc: payeeForm.ifsc.toUpperCase(),
    };
    const nextProfiles = [
      ...payeeProfiles.filter(
        (item) => item.name.trim().toLowerCase() !== payee.toLowerCase(),
      ),
      profile,
    ];
    savePayeeProfiles(nextProfiles);
    setRuleModalOpen(false);
    setMessage(`Reconciliation agreement saved for ${payee}.${recalculated ? ` ${recalculated} unpaid payout${recalculated === 1 ? "" : "s"} recalculated.` : ""}`);
  };
  const requestDeleteRule = () => {
    if (!ruleForm.id || !rules.some((rule) => rule.id === ruleForm.id)) return;
    setConfirmAction("delete_agreement");
  };
  const deleteRule = () => {
    if (!ruleForm.id || !rules.some((rule) => rule.id === ruleForm.id)) return;
    saveRules(rules.filter((rule) => rule.id !== ruleForm.id));
    setRuleModalOpen(false);
    setMessage(`Agreement deleted for ${ruleForm.payee}.`);
  };
  const attachMou = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (file.size > MAX_UPLOAD_BYTES || !allowedMouFileTypes.has(file.type)) {
      setMessage("MOU must be a PDF, JPG, PNG, or WebP file smaller than 10 MB.");
      return;
    }
    setRuleForm((current) => ({
      ...current,
      mouFileName: file.name,
      mouUploadedAt: new Date().toISOString(),
    }));
    setMessage("MOU document attached. Enter the agreement terms manually, then save.");
  };
  const renderSharingSection = (
    key: keyof Pick<ConsolidatedTerms, "doctorPatient" | "hospitalPatient" | "referralCash" | "referralInsurance" | "partnerPatientAndDoctor" | "partnerPatientOnly" | "assistantSurgeon">,
    title: string,
    description: string,
    options: { deductions?: boolean; revenueBasis?: boolean } = {},
  ) => {
    const term = consolidatedTerms[key];
    const includeDeductions = options.deductions ?? true;
    const includeRevenueBasis = options.revenueBasis ?? true;
    return (
      <section className="agreement-term-panel" key={key}>
        <div className="term-heading">
          <strong>{title}</strong><small>{description}</small>
        </div>
        <>
          <div className="two">
            <label className="field"><span>Sharing percentage</span><div className="amount"><b>%</b><input type="number" min="0" max="100" step="0.01" value={term.percentage || ""} onChange={(event) => { const percentage = Number(event.target.value); updateConsolidatedTerm(key, { percentage, enabled: percentage > 0 }); }} /></div></label>
            {includeRevenueBasis && <label className="field"><span>Revenue basis</span><select value={term.revenueBasis} onChange={(event) => updateConsolidatedTerm(key, { revenueBasis: event.target.value as ReconciliationRule["revenueBasis"] })}><option value="billed">Gross billed amount</option><option value="settled_tpa">Settled TPA amount</option><option value="payment_received">Payment received</option><option value="remaining_amount">Remaining amount after deductions</option><option value="partner_commission">Partner commission</option></select></label>}
          </div>
          {includeDeductions && <div className="deduction-picker">
            <label className="field"><span>Add a deduction</span><select value="" onChange={(event) => updateConsolidatedDeductions(key, event.target.value)}><option value="">Select a deduction…</option>{term.deductions.length < deductionOptions.length && <option value="all">Select all deductions</option>}{deductionOptions.filter((option) => !term.deductions.includes(option.key)).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
            <div className="deduction-chips" aria-label={`${title} selected deductions`}>
              {term.deductions.length ? term.deductions.map((deduction) => <button type="button" className="deduction-chip" key={deduction} onClick={() => removeConsolidatedDeduction(key, deduction)}>{deductionOptions.find((item) => item.key === deduction)?.label || deduction}<span aria-hidden="true">×</span></button>) : <p className="form-help">No deductions selected.</p>}
            </div>
          </div>}
        </>
      </section>
    );
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (file.size > MAX_UPLOAD_BYTES || !/\.(csv|xlsx)$/i.test(file.name)) {
      setMessage("Upload a CSV or XLSX file smaller than 10 MB.");
      return;
    }
    setImporting(true);
    setMessage("");
    try {
      const rows = await importReconciliationFile(file);
      const payoutRows = rows.filter((row) => {
        if (row.type !== "Doctor") return true;
        const partnerRow = rows.find(
          (item) => item.caseRef === row.caseRef && item.type === "Partner",
        );
        if (!partnerRow) return true;
        const partnerTerms = rules.find(
          (rule) =>
            rule.payee.trim().toLowerCase() === partnerRow.payee.trim().toLowerCase() &&
            rule.role === "Partner" &&
            rule.consolidatedTerms,
        )?.consolidatedTerms;
        if (!partnerTerms) return true;
        const partnerType = partnerRow.partnerType.toLowerCase();
        const partnerIncludesDoctor = partnerType
          ? partnerType.includes("doctor") || partnerType.includes("both")
          : partnerTerms.defaultPartnerTerms === "partner_patient_and_doctor";
        return !partnerIncludesDoctor;
      });
      let basicRuleCount = 0;
      const additions = payoutRows.map(
        (row, index): Payable => {
          const consolidatedRule = rules.find(
            (rule) =>
              rule.payee.trim().toLowerCase() === row.payee.trim().toLowerCase() &&
              rule.role.toLowerCase() === row.type.toLowerCase() &&
              rule.consolidatedTerms,
          );
          const matchingRules = rules.filter(
            (rule) =>
              rule.payee.trim().toLowerCase() === row.payee.trim().toLowerCase() &&
              rule.role.toLowerCase() === row.type.toLowerCase(),
          );
          const importedPatientSource = row.patientSource.toLowerCase().includes("doctor")
            ? "doctor_patient"
            : "hospital_patient";
          const matchingRule = row.patientSource
            ? matchingRules.find(
                (rule) => rule.patientSource === importedPatientSource,
              )
            : matchingRules[0];
          const terms = consolidatedRule?.consolidatedTerms;
          const referralIsInsurance = row.caseType.toLowerCase().includes("insurance") || row.caseType.toLowerCase().includes("tpa");
          const partnerAttribution = row.partnerType.toLowerCase();
          const partnerIsBoth = partnerAttribution
            ? partnerAttribution.includes("doctor") || partnerAttribution.includes("both")
            : terms?.defaultPartnerTerms === "partner_patient_and_doctor";
          const preferredShare: SharingTerms | undefined = terms
            ? row.type === "Doctor"
              ? importedPatientSource === "doctor_patient" ? terms.doctorPatient : terms.hospitalPatient
              : row.type === "Referral" ? referralIsInsurance ? terms.referralInsurance : terms.referralCash
              : row.type === "Partner" ? partnerIsBoth ? terms.partnerPatientAndDoctor : terms.partnerPatientOnly
              : row.type === "Assistant Surgeon" ? terms.assistantSurgeon
              : undefined
            : undefined;
          const alternateShare: SharingTerms | undefined = terms
            ? row.type === "Referral" ? referralIsInsurance ? terms.referralCash : terms.referralInsurance
              : row.type === "Partner" ? partnerIsBoth ? terms.partnerPatientOnly : terms.partnerPatientAndDoctor
              : undefined
            : undefined;
          const activeShare = preferredShare?.enabled
            ? preferredShare
            : alternateShare?.enabled
              ? alternateShare
              : undefined;
          const useBasicRule = !matchingRule || (terms && row.type !== "Anaesthetist" && !activeShare) || (terms && row.type === "Anaesthetist" && !terms.anaesthetistEnabled);
          if (useBasicRule) basicRuleCount += 1;
          const percentage = activeShare?.percentage ?? matchingRule?.percentage ?? 20;
          const deductionAmounts: Record<DeductionKey, number> = {
            dci: row.dci,
            cross_consultation: row.crossConsultation,
            referral_commission: row.referralCommission,
            external_lab: row.externalLab,
            external_diagnostics: row.externalDiagnostics,
            anaesthetist: row.anaesthetist,
            assistant_surgeon: row.assistantSurgeon,
            consumables: row.consumables,
            special_equipment: row.specialEquipment,
            external_visit: row.externalVisit,
            implant: row.implant,
            b2b_partner_payout: row.b2bPartnerPayout,
            blood_procurement: row.bloodProcurement,
            corporate_discount_adjustment: row.corporateDiscountAdjustment,
            custom_payout: row.customPayout,
            emi_reimbursement_cost: row.emiReimbursementCost,
            medical_equipment_rental: row.medicalEquipmentRental,
            outside_lab_payout: row.outsideLabPayout,
            referral_payout: row.referralPayout,
            surgeon_payout: row.surgeonPayout,
            visiting_consultant_fee: row.visitingConsultantFee,
          };
          const selectedDeductions: DeductionKey[] = useBasicRule
            ? ["external_lab", "implant"]
            : activeShare?.deductions || matchingRule?.selectedDeductions || ["external_lab", "implant"];
          const excludedCosts = selectedDeductions.reduce(
            (total, deduction) => total + deductionAmounts[deduction],
            0,
          );
          const eligibleRevenue = Math.max(0, row.surgeryAmount - excludedCosts);
          return {
            id: `PAY-${Date.now().toString().slice(-6)}-${index + 1}`,
            payee: row.payee,
            type: row.type,
            caseRef: row.caseRef,
            patientName: row.patientName,
            patientPhone: row.patientPhone,
            uhid: row.uhid,
            hospitalName: row.hospitalName,
            admissionDate: row.admissionDate,
            dischargeDate: row.dischargeDate,
            totalRevenue: row.surgeryAmount,
            totalExpense: row.totalExpense,
            reportedProfit: row.reportedProfit,
            surgeryName: row.surgeryName,
            patientSource: row.patientSource,
            caseType: row.caseType,
            partnerType: row.partnerType,
            anaesthesiaHours: row.anaesthesiaHours,
            deductionAmounts,
            gross: row.type === "Anaesthetist" && terms?.anaesthetistEnabled
              ? terms.anaesthesiaFirstHourRate +
                Math.max(0, Math.ceil((row.anaesthesiaHours || 1) - 1)) *
                  terms.anaesthesiaAdditionalHourRate
              : row.type === "Doctor" && importedPatientSource === "hospital_patient" && terms?.hospitalSurgeonFees.length
                ? terms.hospitalSurgeonFees.find(
                    (item) => item.surgeryName.trim().toLowerCase() === row.surgeryName.trim().toLowerCase(),
                  )?.surgeonFee ?? eligibleRevenue * (percentage / 100)
              : matchingRule?.payoutMethod === "surgeon_fee"
              ? matchingRule.surgeryFees?.find(
                    (item) =>
                      item.surgeryName.trim().toLowerCase() ===
                      row.surgeryName.trim().toLowerCase(),
                  )?.surgeonFee ?? matchingRule.surgeonFee
              : matchingRule?.role === "Anaesthetist"
                ? matchingRule.anaesthesiaFirstHourRate +
                  Math.max(0, Math.ceil((row.anaesthesiaHours || 1) - 1)) *
                    matchingRule.anaesthesiaAdditionalHourRate
              : eligibleRevenue * (percentage / 100),
            eligibleRevenue,
            excludedCosts,
            percentage,
            ruleSource: useBasicRule ? "basic" : "mou",
            tds: 0,
            status: "approved",
            bank: "Payee details pending",
          };
        },
      );
      savePayables([...additions, ...payables]);
      setActiveTab("queue");
      setMessage(
        `${additions.length} payout${additions.length === 1 ? "" : "s"} added to Monday's queue.${basicRuleCount ? ` ${basicRuleCount} used the basic 20% rule because no usable MOU was found.` : ""}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not import this file.",
      );
    } finally {
      setImporting(false);
    }
  };

  const selectedCasePayables = caseDetails
    ? payables.filter((item) => item.caseRef === caseDetails.caseRef)
    : [];
  const selectedCasePayoutTotal = selectedCasePayables.reduce(
    (sum, item) => sum + item.gross - item.tds,
    0,
  );
  const selectedCaseRevenue = caseDetails?.totalRevenue || 0;
  const selectedCaseProfit = caseDetails?.reportedProfit ?? 0;
  const selectedCaseMargin = selectedCaseRevenue > 0
    ? (selectedCaseProfit / selectedCaseRevenue) * 100
    : 0;

  return (
    <main>
      <section className="finance-hero">
        <div>
          <p className="eyebrow">Finance workspace</p>
          <h1>Hospital reconciliation</h1>
          <p>
            Review payables, approve the Monday payment batch, and keep doctor,
            partner, vendor, rental, implant, and lab payments traceable.
          </p>
        </div>
        <div className="finance-import">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={importFile}
            hidden
          />
          <button
            className="primary"
            disabled={importing}
            onClick={() => inputRef.current?.click()}
          >
            {importing ? "Importing…" : "Import Excel"}
          </button>
          <small>Agreement-based payout → Monday queue</small>
        </div>
      </section>

      <nav className="finance-tabs" aria-label="Finance workspace">
        <button
          className={activeTab === "dashboard" ? "active" : ""}
          onClick={() => setActiveTab("dashboard")}
        >
          Overview
        </button>
        <button
          className={activeTab === "queue" ? "active" : ""}
          onClick={() => setActiveTab("queue")}
        >
          Payment queue
        </button>
        <button
          className={activeTab === "agreements" ? "active" : ""}
          onClick={() => setActiveTab("agreements")}
        >
          MOU agreements
        </button>
        <button
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
        >
          Payment history
        </button>
      </nav>

      {activeTab === "dashboard" && (
        <>
          <div className="finance-metrics">
            <Metric
              label="Awaiting approval"
              value={money(totals.submitted)}
              caption="Submitted payables"
            />
            <Metric
              label="Monday payment run"
              value={money(totals.approved)}
              caption="Approved for payment"
            />
            <Metric
              label="Paid this week"
              value={money(totals.paid)}
              caption="Confirmed payments"
            />
            <Metric
              label="TDS tracked"
              value={money(payables.reduce((sum, item) => sum + item.tds, 0))}
              caption="Across current payables"
            />
          </div>
          <section className="card">
            <div className="section-title">
              <div>
                <h1>Monday payment checklist</h1>
                <p className="form-help">
                  Import Case Reference, Payee, Type, and Surgery Amount. Add
                  optional Patient Source (Doctor or Hospital), DCI, Cross Consultation, Referral Commission,
                  External Diagnostics, Anaesthetist, Consumables, Special Equipment,
                  External Visit, External Lab, Implant, and Anaesthesia Hours columns. The selected
                  MOU rule removes only its configured deductions before sharing.
                </p>
              </div>
              <span className="source-badge">Next run: Monday</span>
            </div>
            <ol className="checklist">
              <li>Import the completed expense and surgery workbook.</li>
              <li>Review the agreement-based payout and its eligible revenue.</li>
              <li>Verify payee details and TDS, then mark payments as paid.</li>
            </ol>
          </section>
        </>
      )}

      {activeTab === "queue" && (
        <section className="card">
          <div className="section-title">
            <div>
              <h1>Payment queue</h1>
              <p className="form-help">
                Only unpaid items are shown. Click a name to see each surgery
                and role.
              </p>
            </div>
            <div className="section-actions">
              <span className="source-badge">
                {money(totals.submitted + totals.approved)} unpaid total
              </span>
              {unpaidPayableGroups.length > 0 && (
                <button className="danger" onClick={requestClearUnpaidQueue}>
                  Clear unpaid queue
                </button>
              )}
            </div>
          </div>
          <div className="payable-list">
            {unpaidPayableGroups.length ? (
              unpaidPayableGroups.map((group) => (
                <article className="payable payable-group" key={group.key}>
                  <div>
                    <button
                      className="payee-toggle"
                      onClick={() => togglePayee(group.key)}
                      aria-expanded={expandedPayees.includes(group.key)}
                    >
                      <strong>{group.payee}</strong>
                      <span>
                        {expandedPayees.includes(group.key) ? "Hide" : "Show"}{" "}
                        {group.items.length}{" "}
                        {group.items.length === 1 ? "surgery" : "surgeries"}
                      </span>
                    </button>
                    {expandedPayees.includes(group.key) && (
                      <div className="surgery-popout">
                        {group.items.map((item) => (
                          <div key={item.id}>
                            <button type="button" className="case-reference" onClick={() => setCaseDetails(item)}>
                              {item.patientName || item.caseRef}
                            </button>
                            <span>{item.patientName ? `IPD ${item.caseRef} · ${item.type}` : item.type}</span>
                            <b>{money(item.gross - item.tds)}</b>
                            <small>
                              {item.ruleSource === "basic" ? "Basic rule: " : "MOU: "}{item.percentage ?? 20}% of {money(item.eligibleRevenue ?? 0)} eligible revenue · {item.status}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="payable-amount">
                    <b>{money(group.gross - group.tds)}</b>
                    <span>
                      {group.items.length} surgery payout
                      {group.items.length === 1 ? "" : "s"} · TDS{" "}
                      {money(group.tds)}
                    </span>
                  </div>
                  <div className="payable-actions">
                    <em className={`payment-status ${group.status}`}>
                      {group.status.replace("_", " ")}
                    </em>
                    {group.status === "submitted" && (
                      <button
                        onClick={() =>
                          changeGroupStatus(group.items, "approved")
                        }
                      >
                        Approve
                      </button>
                    )}
                    {group.status === "approved" && (
                      <>
                        <button onClick={() => openUpiQr(group)}>UPI QR</button>
                        <button
                          className="primary"
                          onClick={() => changeGroupStatus(group.items, "paid")}
                        >
                          Mark paid
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="form-help">
                No unpaid payments. View completed surgery payments in Payment
                history.
              </p>
            )}
          </div>
        </section>
      )}

      {activeTab === "agreements" && (
        <section className="card">
          <div className="section-title">
            <div>
              <h1>Doctor & referral MOU agreements</h1>
              <p className="form-help">
                Record each doctor’s MOU exactly: patient source, revenue basis, deductions, OPD share, rental, visit charges, fixed monthly amount, and payment terms.
              </p>
            </div>
            <button className="primary" onClick={() => openRule()}>
              Add agreement
            </button>
          </div>
          <div className="agreement-list">
            {rules.length ? rules.map((rule) => (
              <article className="agreement-row" key={rule.id}>
                <div>
                  <strong>{rule.payee}</strong>
                  <span>{rule.consolidatedTerms ? `${rule.role} MOU terms` : `${rule.role} · ${rule.patientSource === "doctor_patient" ? "Doctor’s patient" : "Hospital’s patient"} · ${rule.payoutMethod === "surgeon_fee" ? `${rule.surgeryFees?.length || 1} surgery-wise surgeon fee${(rule.surgeryFees?.length || 1) === 1 ? "" : "s"}` : `${rule.percentage}% of ${rule.revenueBasis.replace(/_/g, " ")}`}`}</span>
                  <small>
                    {rule.fixedMonthlyAmount ? `Fixed monthly ${money(rule.fixedMonthlyAmount)} · ` : ""}{rule.opdSharePercentage ? `OPD ${rule.opdSharePercentage}% · ` : ""}Exclusions recorded · {rule.mouFileName ? `MOU: ${rule.mouFileName}` : "Manual agreement"}
                  </small>
                </div>
                <button className="secondary" onClick={() => openRule(rule)}>Edit</button>
              </article>
            )) : (
              <p className="form-help">No agreements yet. Add the doctor or referral terms before importing cases.</p>
            )}
          </div>
          {ruleModalOpen && (
            <div className="modal-backdrop" role="presentation" onMouseDown={() => setRuleModalOpen(false)}>
              <section className="payee-modal" role="dialog" aria-modal="true" aria-label="Reconciliation agreement" onMouseDown={(event) => event.stopPropagation()}>
                <div className="section-title">
                  <div>
                    <h1>{ruleForm.payee ? `Agreement for ${ruleForm.payee}` : "New reconciliation agreement"}</h1>
                    <p className="form-help">Enter the agreement terms manually. You can attach an MOU file as a record.</p>
                  </div>
                  <button className="modal-close" onClick={() => setRuleModalOpen(false)} aria-label="Close">×</button>
                </div>
                <form onSubmit={saveRule}>
                  <div className="two">
                    <label className="field"><span>Doctor / payee name</span><input required value={ruleForm.payee} onChange={(event) => { const name = event.target.value; setRuleForm((current) => ({ ...current, payee: name })); setPayeeForm((current) => ({ ...current, name })); }} placeholder="e.g. Dr Mehta" /></label>
                    <label className="field"><span>Payout role</span><select value={ruleForm.role} onChange={(event) => { const role = event.target.value; setRuleForm((current) => ({ ...current, role, consolidatedTerms: emptyConsolidatedTerms() })); setPayeeForm((current) => ({ ...current, category: role })); }}><option>Doctor</option><option>Referral</option><option>Anaesthetist</option><option>Assistant Surgeon</option><option>Partner</option></select></label>
                    <div className="mou-upload"><span>MOU document <em>optional record</em></span><input ref={mouInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={attachMou} /><small>{ruleForm.mouFileName ? `Attached: ${ruleForm.mouFileName}` : "Attach a PDF or image for the agreement record."}</small></div>
                  </div>
                  <p className="form-help">Each role has its own agreement screen. For doctors, all patient scenarios are shown separately.</p>
                  {ruleForm.role === "Doctor" && <>
                  {renderSharingSection("doctorPatient", "Doctor’s patient", "Doctor receives a percentage after the selected deductions.")}
                  {renderSharingSection("hospitalPatient", "Hospital’s patient — percentage share", "Doctor receives a percentage after the selected deductions.")}
                  <section className="agreement-term-panel">
                    <div className="section-title"><div><h2>Hospital’s patient — fixed surgeon fees</h2><p className="form-help">Optional fixed fee by surgery, instead of a percentage.</p></div><button type="button" className="secondary" onClick={addConsolidatedSurgeryFee}>Add surgery</button></div>
                    {consolidatedTerms.hospitalSurgeonFees.length > 0 && <div className="surgery-fee-list">{consolidatedTerms.hospitalSurgeonFees.map((item) => <div className="surgery-fee-row" key={item.id}><label className="field"><span>Surgery name</span><input value={item.surgeryName} onChange={(event) => updateConsolidatedSurgeryFee(item.id, "surgeryName", event.target.value)} placeholder="e.g. Knee replacement" /></label><label className="field"><span>Fixed surgeon fee</span><div className="amount"><b>₹</b><input type="number" min="0" value={item.surgeonFee || ""} onChange={(event) => updateConsolidatedSurgeryFee(item.id, "surgeonFee", Number(event.target.value))} /></div></label><button type="button" className="remove-surgery" onClick={() => removeConsolidatedSurgeryFee(item.id)}>Remove</button></div>)}</div>}
                  </section>
                  </>}
                  {ruleForm.role === "Referral" && <>
                  <h2>Referral terms</h2>
                  {renderSharingSection("referralCash", "Cash case", "Referral percentage for cash cases.", { revenueBasis: false })}
                  {renderSharingSection("referralInsurance", "Insurance / TPA case", "Referral percentage after revenue basis and selected deductions.")}
                  </>}
                  {ruleForm.role === "Partner" && <>
                  <h2>Partner terms</h2>
                  <label className="field"><span>Default partner terms</span><select value={consolidatedTerms.defaultPartnerTerms || "partner_patient_only"} onChange={(event) => updateConsolidatedTerms({ defaultPartnerTerms: event.target.value as ConsolidatedTerms["defaultPartnerTerms"] })}><option value="partner_patient_and_doctor">Partner patient + partner doctor</option><option value="partner_patient_only">Partner patient only</option></select><small>Used when the Excel has a partner name but no clear partner attribution.</small></label>
                  {renderSharingSection("partnerPatientAndDoctor", "Partner patient + partner doctor", "Partner percentage when both patient and doctor are from the partner.", { revenueBasis: false })}
                  {renderSharingSection("partnerPatientOnly", "Partner patient only", "Partner percentage when only the patient is from the partner.", { revenueBasis: false })}
                  </>}
                  {ruleForm.role === "Assistant Surgeon" && <>
                  <h2>Assistant surgeon terms</h2>
                  {renderSharingSection("assistantSurgeon", "Assistant surgeon", "Assistant surgeon percentage after selected deductions.")}
                  </>}
                  {ruleForm.role === "Anaesthetist" && <>
                  <section className="agreement-term-panel">
                    <div className="term-heading"><strong>Anaesthetist</strong><small>First hour plus each additional hour.</small></div>
                    <div className="two"><label className="field"><span>First hour payout</span><div className="amount"><b>₹</b><input type="number" min="0" value={consolidatedTerms.anaesthesiaFirstHourRate || ""} onChange={(event) => { const anaesthesiaFirstHourRate = Number(event.target.value); updateConsolidatedTerms({ anaesthesiaFirstHourRate, anaesthetistEnabled: anaesthesiaFirstHourRate > 0 }); }} placeholder="e.g. 3000" /></div></label><label className="field"><span>Each additional hour</span><div className="amount"><b>₹</b><input type="number" min="0" value={consolidatedTerms.anaesthesiaAdditionalHourRate || ""} onChange={(event) => updateConsolidatedTerms({ anaesthesiaAdditionalHourRate: Number(event.target.value) })} placeholder="e.g. 1000" /></div></label></div>
                  </section>
                  </>}
                  {ruleForm.role === "Doctor" && <>
                  <h2>OPD, fixed and payment terms</h2>
                  <div className="three"><label className="field"><span>OPD share percentage</span><div className="amount"><b>%</b><input type="number" min="0" max="100" value={ruleForm.opdSharePercentage || ""} onChange={(event) => setRuleForm((current) => ({ ...current, opdSharePercentage: Number(event.target.value) }))} /></div></label><label className="field"><span>OPD price / visit</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.opdPrice || ""} onChange={(event) => setRuleForm((current) => ({ ...current, opdPrice: Number(event.target.value) }))} /></div></label><label className="field"><span>Fixed rental / month</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.fixedRental || ""} onChange={(event) => setRuleForm((current) => ({ ...current, fixedRental: Number(event.target.value) }))} /></div></label><label className="field"><span>Fixed monthly payment</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.fixedMonthlyAmount || ""} onChange={(event) => setRuleForm((current) => ({ ...current, fixedMonthlyAmount: Number(event.target.value) }))} /></div></label><label className="field"><span>Ward / day visit charge</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.wardVisitCharge || ""} onChange={(event) => setRuleForm((current) => ({ ...current, wardVisitCharge: Number(event.target.value) }))} /></div></label><label className="field"><span>ICU / emergency visit charge</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.icuEmergencyVisitCharge || ""} onChange={(event) => setRuleForm((current) => ({ ...current, icuEmergencyVisitCharge: Number(event.target.value) }))} /></div></label></div>
                  <div className="two"><label className="field"><span>Payment timing <em>optional</em></span><input value={ruleForm.paymentTerms} onChange={(event) => setRuleForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="e.g. Within 48 hours / monthly" /></label><label className="field"><span>Other MOU notes <em>optional</em></span><input value={ruleForm.notes} onChange={(event) => setRuleForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Any special commercial terms" /></label></div>
                  </>}
                  {ruleForm.role !== "Doctor" && <div className="two"><label className="field"><span>Payment timing <em>optional</em></span><input value={ruleForm.paymentTerms} onChange={(event) => setRuleForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="e.g. Within 48 hours / monthly" /></label><label className="field"><span>Other MOU notes <em>optional</em></span><input value={ruleForm.notes} onChange={(event) => setRuleForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Any special commercial terms" /></label></div>}
                  <h2>Payee details</h2>
                  <p className="form-help">These details are saved with this MOU and can be used when payment is processed.</p>
                  <div className="two">
                    <label className="field"><span>PAN number</span><input value={payeeForm.pan} onChange={(event) => setPayeeForm((current) => ({ ...current, pan: event.target.value }))} maxLength={10} placeholder="ABCDE1234F" /></label>
                    <label className="field"><span>Account holder</span><input value={payeeForm.accountHolder} onChange={(event) => setPayeeForm((current) => ({ ...current, accountHolder: event.target.value }))} placeholder="Legal account name" /></label>
                    <label className="field"><span>Account number</span><input value={payeeForm.accountNumber} onChange={(event) => setPayeeForm((current) => ({ ...current, accountNumber: event.target.value }))} inputMode="numeric" placeholder="Bank account number" /></label>
                    <label className="field"><span>IFSC code</span><input value={payeeForm.ifsc} onChange={(event) => setPayeeForm((current) => ({ ...current, ifsc: event.target.value }))} placeholder="e.g. HDFC0001234" /></label>
                    <label className="field"><span>UPI ID <em>optional</em></span><input value={payeeForm.upi} onChange={(event) => setPayeeForm((current) => ({ ...current, upi: event.target.value }))} placeholder="name@bank" /></label>
                  </div>
                  <button className="primary">Save agreement</button><button type="button" className="secondary" onClick={() => setRuleModalOpen(false)}>Cancel</button>{rules.some((rule) => rule.id === ruleForm.id) && <button type="button" className="danger" onClick={requestDeleteRule}>Delete agreement</button>}
                </form>
                {false && <form onSubmit={saveRule}>
                  <div className="two">
                    <label className="field"><span>Doctor / payee name</span><input required value={ruleForm.payee} onChange={(e) => setRuleForm((current) => ({ ...current, payee: e.target.value }))} placeholder="e.g. Dr Mehta" /></label>
                    <label className="field"><span>Payout role</span><select value={ruleForm.role} onChange={(e) => setRuleForm((current) => ({ ...current, role: e.target.value, payoutMethod: e.target.value === "Doctor" ? current.payoutMethod : "percentage" }))}><option>Doctor</option><option>Referral</option><option>Anaesthetist</option><option>Assistant Surgeon</option><option>Partner</option></select></label>
                    {ruleForm.role === "Doctor" && <label className="field"><span>Patient type & payout</span><select value={`${ruleForm.patientSource}:${ruleForm.payoutMethod}`} onChange={(e) => { const [patientSource, payoutMethod] = e.target.value.split(":") as [ReconciliationRule["patientSource"], ReconciliationRule["payoutMethod"]]; setRuleForm((current) => ({ ...current, patientSource, payoutMethod })); }}><option value="doctor_patient:percentage">Doctor’s patient — percentage after deductions</option><option value="hospital_patient:percentage">Hospital’s patient — percentage after deductions</option><option value="hospital_patient:surgeon_fee">Hospital’s patient — fixed surgeon fee</option></select></label>}
                    {ruleForm.role === "Referral" && <label className="field"><span>Referral case type</span><select value={ruleForm.referralCaseType} onChange={(e) => setRuleForm((current) => ({ ...current, referralCaseType: e.target.value as ReconciliationRule["referralCaseType"] }))}><option value="cash">Cash case</option><option value="insurance">Insurance / TPA case</option></select></label>}
                    {ruleForm.role === "Partner" && <label className="field"><span>Partner type</span><select value={ruleForm.partnerType} onChange={(e) => setRuleForm((current) => ({ ...current, partnerType: e.target.value as ReconciliationRule["partnerType"] }))}><option value="partner_patient_and_doctor">Partner patient + partner doctor</option><option value="partner_patient_only">Partner patient only</option></select></label>}
                    {(ruleForm.role === "Doctor" || ruleForm.role === "Assistant Surgeon" || (ruleForm.role === "Referral" && ruleForm.referralCaseType === "insurance")) && <label className="field"><span>Revenue basis</span><select value={ruleForm.revenueBasis} onChange={(e) => setRuleForm((current) => ({ ...current, revenueBasis: e.target.value as ReconciliationRule["revenueBasis"] }))}><option value="billed">Gross billed amount</option><option value="settled_tpa">Settled TPA amount</option><option value="payment_received">Payment received</option><option value="remaining_amount">Remaining amount after deductions</option><option value="partner_commission">Partner commission</option><option value="fixed">Fixed amount</option></select></label>}
                    {ruleForm.role !== "Anaesthetist" && (ruleForm.role !== "Doctor" || ruleForm.payoutMethod === "percentage") && <label className="field"><span>{ruleForm.role === "Referral" ? "Referral share percentage" : ruleForm.role === "Partner" ? "Partner share percentage" : "IPD / revenue share percentage"}</span><div className="amount"><b>%</b><input required type="number" min="0" max="100" step="0.01" value={ruleForm.percentage} onChange={(e) => setRuleForm((current) => ({ ...current, percentage: Number(e.target.value) }))} /></div></label>}
                    {ruleForm.role === "Anaesthetist" && <><label className="field"><span>First hour payout</span><div className="amount"><b>₹</b><input required type="number" min="0" value={ruleForm.anaesthesiaFirstHourRate || ""} onChange={(e) => setRuleForm((current) => ({ ...current, anaesthesiaFirstHourRate: Number(e.target.value) }))} placeholder="e.g. 3000" /></div></label><label className="field"><span>Each additional hour</span><div className="amount"><b>₹</b><input required type="number" min="0" value={ruleForm.anaesthesiaAdditionalHourRate || ""} onChange={(e) => setRuleForm((current) => ({ ...current, anaesthesiaAdditionalHourRate: Number(e.target.value) }))} placeholder="e.g. 1000" /></div></label></>}
                    <div className="mou-upload"><span>MOU document <em>optional record</em></span><input ref={mouInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={attachMou} /><small>{ruleForm.mouFileName ? `Attached: ${ruleForm.mouFileName}` : "Attach a PDF or image for the agreement record."}</small></div>
                  </div>
                  {ruleForm.role === "Doctor" && ruleForm.patientSource === "hospital_patient" && ruleForm.payoutMethod === "surgeon_fee" && (
                    <section className="surgery-fee-section">
                      <div className="section-title">
                        <div>
                          <h2>Surgery-wise surgeon fees</h2>
                          <p className="form-help">Add every hospital surgery covered by this agreement and the doctor’s fixed fee for that surgery.</p>
                        </div>
                        <button type="button" className="secondary" onClick={addSurgeryFee}>Add surgery</button>
                      </div>
                      {ruleForm.surgeryFees.length === 0 ? (
                        <p className="form-help">No surgeries added yet. Select “Add surgery” to enter the surgery name and fee.</p>
                      ) : (
                        <div className="surgery-fee-list">
                          {ruleForm.surgeryFees.map((item) => (
                            <div className="surgery-fee-row" key={item.id}>
                              <label className="field"><span>Surgery name</span><input value={item.surgeryName} onChange={(e) => updateSurgeryFee(item.id, "surgeryName", e.target.value)} placeholder="e.g. Knee replacement" /></label>
                              <label className="field"><span>Fixed surgeon fee</span><div className="amount"><b>₹</b><input type="number" min="0" value={item.surgeonFee || ""} onChange={(e) => updateSurgeryFee(item.id, "surgeonFee", Number(e.target.value))} placeholder="0" /></div></label>
                              <button type="button" className="remove-surgery" onClick={() => removeSurgeryFee(item.id)} aria-label={`Remove ${item.surgeryName || "surgery"}`}>Remove</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                  {(ruleForm.role === "Doctor" || ruleForm.role === "Assistant Surgeon" || (ruleForm.role === "Referral" && ruleForm.referralCaseType === "insurance")) && <><h2>Revenue deductions before this share</h2>
                  <div className="deduction-picker">
                    <label className="field"><span>Add a deduction</span><select value="" onChange={(event) => addDeduction(event.target.value)}><option value="">Select a deduction…</option>{ruleForm.selectedDeductions.length < deductionOptions.length && <option value="all">Select all deductions</option>}{deductionOptions.filter((option) => !ruleForm.selectedDeductions.includes(option.key)).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
                    <div className="deduction-chips" aria-label="Selected deductions">
                      {ruleForm.selectedDeductions.length ? ruleForm.selectedDeductions.map((deduction) => {
                        const option = deductionOptions.find((item) => item.key === deduction);
                        return <button type="button" className="deduction-chip" key={deduction} onClick={() => removeDeduction(deduction)}>{option?.label || deduction}<span aria-hidden="true">×</span></button>;
                      }) : <p className="form-help">No deductions selected. The full revenue basis will be used.</p>}
                    </div>
                  </div>
                  </>}
                  {ruleForm.role === "Doctor" && <><h2>OPD, fixed and payment terms</h2>
                  <div className="three">
                    <label className="field"><span>OPD share percentage</span><div className="amount"><b>%</b><input type="number" min="0" max="100" value={ruleForm.opdSharePercentage || ""} onChange={(e) => setRuleForm((current) => ({ ...current, opdSharePercentage: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>OPD price / visit</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.opdPrice || ""} onChange={(e) => setRuleForm((current) => ({ ...current, opdPrice: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>Fixed rental / month</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.fixedRental || ""} onChange={(e) => setRuleForm((current) => ({ ...current, fixedRental: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>Fixed monthly payment</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.fixedMonthlyAmount || ""} onChange={(e) => setRuleForm((current) => ({ ...current, fixedMonthlyAmount: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>Ward / day visit charge</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.wardVisitCharge || ""} onChange={(e) => setRuleForm((current) => ({ ...current, wardVisitCharge: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>ICU / emergency visit charge</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.icuEmergencyVisitCharge || ""} onChange={(e) => setRuleForm((current) => ({ ...current, icuEmergencyVisitCharge: Number(e.target.value) }))} /></div></label>
                  </div>
                  <div className="two">
                    <label className="field"><span>Payment timing</span><input value={ruleForm.paymentTerms} onChange={(e) => setRuleForm((current) => ({ ...current, paymentTerms: e.target.value }))} placeholder="e.g. Within 48 hours of surgery / 5th of following month" /></label>
                    <label className="field"><span>Other MOU notes</span><input value={ruleForm.notes} onChange={(e) => setRuleForm((current) => ({ ...current, notes: e.target.value }))} placeholder="e.g. 20 OT/month, ₹3,000/OT after 20" /></label>
                    <label className="field"><span>Effective from <em>optional</em></span><input type="date" value={ruleForm.effectiveFrom} onChange={(e) => setRuleForm((current) => ({ ...current, effectiveFrom: e.target.value }))} /></label>
                    <label className="field"><span>Effective to <em>optional</em></span><input type="date" value={ruleForm.effectiveTo} onChange={(e) => setRuleForm((current) => ({ ...current, effectiveTo: e.target.value }))} /></label>
                  </div>
                  </>}
                  {ruleForm.role !== "Doctor" && <div className="two"><label className="field"><span>Payment timing <em>optional</em></span><input value={ruleForm.paymentTerms} onChange={(e) => setRuleForm((current) => ({ ...current, paymentTerms: e.target.value }))} placeholder="e.g. Within 48 hours / monthly" /></label><label className="field"><span>Other MOU notes <em>optional</em></span><input value={ruleForm.notes} onChange={(e) => setRuleForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Any special commercial terms" /></label></div>}
                  <button className="primary">Save agreement</button><button type="button" className="secondary" onClick={() => setRuleModalOpen(false)}>Cancel</button>{rules.some((rule) => rule.id === ruleForm.id) && <button type="button" className="danger" onClick={requestDeleteRule}>Delete agreement</button>}
                </form>}
              </section>
            </div>
          )}
        </section>
      )}

      {activeTab === "history" && (
        <section className="card">
          <div className="section-title">
            <div>
              <h1>Payment history</h1>
              <p className="form-help">
                Completed payments, shown surgery-by-surgery.
              </p>
            </div>
            <span className="source-badge">
              {money(totals.paid)} paid total
            </span>
          </div>
          <div className="history-list">
            {payables.filter((item) => item.status === "paid").length ? (
              payables
                .filter((item) => item.status === "paid")
                .map((item) => (
                  <article className="history-payment" key={item.id}>
                    <div>
                      <strong>{item.caseRef}</strong>
                      <span>
                        {item.payee} · {item.type}
                      </span>
                    </div>
                    <b>{money(item.gross - item.tds)}</b>
                  </article>
                ))
            ) : (
              <p className="form-help">
                No payments have been marked as paid yet.
              </p>
            )}
          </div>
        </section>
      )}

      {activeTab === "bank" && (
        <section className="card bank-card">
          <div className="section-title">
            <div>
              <h1>Payee details</h1>
              <p className="form-help">
                Tap a name to add or edit verified PAN and payment details.
              </p>
            </div>
            <span className="source-badge">
              {vendorDirectory.length} payees
            </span>
          </div>
          <div className="vendor-directory">
            {vendorDirectory.length ? (
              vendorDirectory.map((item) => (
                <button
                  key={item.name}
                  className="vendor-row"
                  onClick={() => editPayee(item.name, item.category)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.category}</small>
                  </span>
                  <span>
                    {item.profile?.pan
                      ? `PAN ${item.profile.pan}`
                      : "Details pending"}
                  </span>
                </button>
              ))
            ) : (
              <p className="form-help">
                Import a reconciliation file or add a vendor.
              </p>
            )}
          </div>
          <button className="secondary add-payee" onClick={addPayee}>
            Add vendor / payee
          </button>
          {payeeModalOpen && (
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={() => setPayeeModalOpen(false)}
            >
              <section
                className="payee-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Payee details"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="section-title">
                  <div>
                    <h1>
                      {payeeForm.name
                        ? `Details for ${payeeForm.name}`
                        : "Add vendor / payee"}
                    </h1>
                    <p className="form-help">
                      Store verified PAN and payment details before payment.
                    </p>
                  </div>
                  <button
                    className="modal-close"
                    onClick={() => setPayeeModalOpen(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={savePayeeProfile}>
                  <div className="two">
                    <label className="field">
                      <span>Name</span>
                      <input
                        required
                        value={payeeForm.name}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            name: e.target.value,
                          }))
                        }
                        placeholder="Payee legal name"
                      />
                    </label>
                    <label className="field">
                      <span>Role / category</span>
                      <select
                        value={payeeForm.category}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            category: e.target.value,
                          }))
                        }
                      >
                        <option>Doctor</option>
                        <option>Referral</option>
                        <option>Anaesthetist</option>
                        <option>Partner</option>
                        <option>Vendor</option>
                        <option>Lab</option>
                        <option>Rental</option>
                        <option>Implant</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>PAN number</span>
                      <input
                        value={payeeForm.pan}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            pan: e.target.value,
                          }))
                        }
                        maxLength={10}
                        placeholder="ABCDE1234F"
                      />
                    </label>
                    <label className="field">
                      <span>Account holder</span>
                      <input
                        value={payeeForm.accountHolder}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            accountHolder: e.target.value,
                          }))
                        }
                        placeholder="Legal account name"
                      />
                    </label>
                    <label className="field">
                      <span>Account number</span>
                      <input
                        value={payeeForm.accountNumber}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            accountNumber: e.target.value,
                          }))
                        }
                        inputMode="numeric"
                        placeholder="Bank account number"
                      />
                    </label>
                    <label className="field">
                      <span>IFSC code</span>
                      <input
                        value={payeeForm.ifsc}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            ifsc: e.target.value,
                          }))
                        }
                        placeholder="e.g. HDFC0001234"
                      />
                    </label>
                    <label className="field">
                      <span>
                        UPI ID <em>optional</em>
                      </span>
                      <input
                        value={payeeForm.upi}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            upi: e.target.value,
                          }))
                        }
                        placeholder="name@bank"
                      />
                    </label>
                  </div>
                  <button className="primary">Save details</button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPayeeModalOpen(false)}
                  >
                    Cancel
                  </button>
                  {payeeForm.name.trim() && (
                    <button
                      type="button"
                      className="danger"
                      onClick={requestDeletePayee}
                    >
                      Delete payee
                    </button>
                  )}
                </form>
              </section>
            </div>
          )}
        </section>
      )}
      {confirmAction && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setConfirmAction(null)}>
          <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <h1 id="confirm-title">
              {confirmAction === "delete_payee"
                ? "Delete payee?"
                : confirmAction === "clear_unpaid_queue"
                  ? "Clear unpaid payment queue?"
                  : "Delete agreement?"}
            </h1>
            <p>
              {confirmAction === "delete_payee"
                ? `Delete ${payeeForm.name} completely? This permanently removes their payee details, MOU agreements, payment queue items, and payment history.`
                : confirmAction === "clear_unpaid_queue"
                  ? "This permanently removes all submitted and approved payouts. Paid payment history will remain unchanged."
                  : `Delete the agreement for ${ruleForm.payee}? This cannot be undone.`}
            </p>
            <div className="confirm-actions">
              <button type="button" className="secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button type="button" className="danger confirm-delete" onClick={() => { if (confirmAction === "delete_payee") deletePayee(); else if (confirmAction === "clear_unpaid_queue") clearUnpaidQueue(); else deleteRule(); setConfirmAction(null); }}>
                {confirmAction === "clear_unpaid_queue" ? "Clear queue" : "Delete"}
              </button>
            </div>
          </section>
        </div>
      )}
      {caseDetails && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCaseDetails(null)}>
          <section className="case-details-modal" role="dialog" aria-modal="true" aria-label={`IPD ${caseDetails.caseRef} details`} onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setCaseDetails(null)} aria-label="Close">×</button>
            <p className="eyebrow">IPD case</p>
            <h1>{caseDetails.caseRef}</h1>
            {caseDetails.patientName ? <div className="case-patient-grid"><div><span>Patient</span><strong>{caseDetails.patientName}</strong></div><div><span>Phone</span><strong>{caseDetails.patientPhone || "Not provided"}</strong></div><div><span>UHID</span><strong>{caseDetails.uhid || "Not provided"}</strong></div><div><span>Hospital</span><strong>{caseDetails.hospitalName || "Not provided"}</strong></div><div><span>Admission</span><strong>{formatDateTime(caseDetails.admissionDate)}</strong></div><div><span>Discharge</span><strong>{formatDateTime(caseDetails.dischargeDate)}</strong></div></div> : <p className="form-help">Patient information was not included in this older import. Re-import the hospital CSV to see patient details.</p>}
            <div className="case-profit-grid"><div><span>Total revenue</span><strong>{money(selectedCaseRevenue)}</strong></div><div><span>Total expense</span><strong>{money(caseDetails.totalExpense || 0)}</strong></div><div><span>Excel profit</span><strong>{money(selectedCaseProfit)}</strong></div><div><span>Profit margin</span><strong>{selectedCaseMargin.toFixed(1)}%</strong></div></div>
            <h2>Current payouts for this IPD</h2>
            <div className="case-payout-list">{selectedCasePayables.map((item) => <div key={item.id}><span>{item.payee} · {item.type}</span><strong>{money(item.gross - item.tds)}</strong></div>)}</div>
            <p className="form-help">Total queued payout: <strong>{money(selectedCasePayoutTotal)}</strong>. Profit and profit margin are taken from the uploaded Excel’s Profit and Total Revenue columns.</p>
          </section>
        </div>
      )}
      {upiPayment && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setUpiPayment(null)}>
          <section className="upi-modal" role="dialog" aria-modal="true" aria-label="UPI payment QR" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setUpiPayment(null)} aria-label="Close">×</button>
            <h1>Pay {upiPayment.payee}</h1>
            <p>Scan this QR in any UPI app to pay <strong>{money(upiPayment.amount)}</strong>.</p>
            <img src={upiPayment.qrImage} alt={`UPI payment QR for ${upiPayment.payee}`} />
            <strong>{upiPayment.upi}</strong>
            <small>Verify the payee name and amount in your UPI app before confirming payment.</small>
            <div className="confirm-actions">
              <a className="secondary" href={upiPayment.upiLink}>Open UPI app</a>
              <button type="button" className="primary" onClick={() => navigator.clipboard?.writeText(upiPayment.upiLink).then(() => setMessage("UPI payment link copied."))}>Copy payment link</button>
            </div>
          </section>
        </div>
      )}
      {message && <div className="finance-toast" role="status">{message}</div>}
    </main>
  );
}

function Metric({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <section className="finance-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </section>
  );
}
