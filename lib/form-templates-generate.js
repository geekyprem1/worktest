/** Shared generator for 500 form-fill templates (dummy application forms) */

const formTypes = [
  { title: "Job Application Form", desc: "Fill this application with the applicant's details for the listed position." },
  { title: "KYC Verification Form", desc: "Enter the customer's KYC details for identity verification." },
  { title: "Customer Registration Form", desc: "Register a new customer account with the details below." },
  { title: "Loan Application Form", desc: "Fill the applicant's loan request details." },
  { title: "Event Registration Form", desc: "Register the attendee for the upcoming event." },
  { title: "Employee Onboarding Form", desc: "Enter the new employee's joining details." },
  { title: "Student Admission Form", desc: "Fill the student's admission details for the new session." },
  { title: "Vendor Registration Form", desc: "Register a new vendor/supplier with company details." },
  { title: "Insurance Claim Form", desc: "Enter the policyholder's claim details." },
  { title: "Bank Account Opening Form", desc: "Fill the applicant's account opening details." },
  { title: "Membership Signup Form", desc: "Sign up a new member with the details below." },
  { title: "Delivery Address Update Form", desc: "Update the customer's delivery address details." },
  { title: "Refund Request Form", desc: "Enter the customer's refund request details." },
  { title: "Driver Application Form", desc: "Fill the driver's application and licence details." },
  { title: "Tenant Registration Form", desc: "Register the tenant for the rental property." },
  { title: "Course Enrollment Form", desc: "Enroll the student in the selected course." },
  { title: "Warranty Registration Form", desc: "Register the product warranty for the customer." },
  { title: "SIM Card Activation Form", desc: "Enter the customer's SIM activation details." },
  { title: "Internship Application Form", desc: "Fill the candidate's internship application details." },
  { title: "Business Partnership Form", desc: "Register the partner company's details." },
];

const fieldsBank = [
  { key: "email", label: "Email Address", type: "email", required: true, placeholder: "e.g. name@example.com" },
  { key: "phone", label: "Mobile Number", type: "tel", required: true, placeholder: "10-digit mobile number" },
  { key: "altPhone", label: "Alternate Phone", type: "tel", required: false, placeholder: "Optional" },
  { key: "dob", label: "Date of Birth", type: "date", required: true },
  { key: "address", label: "Full Address", type: "text", required: true, placeholder: "House no, street, area" },
  { key: "city", label: "City", type: "text", required: true, placeholder: "e.g. Mumbai" },
  { key: "state", label: "State", type: "text", required: false, placeholder: "e.g. Maharashtra" },
  { key: "pincode", label: "PIN Code", type: "tel", required: true, placeholder: "6-digit PIN" },
  { key: "fatherName", label: "Father's Name", type: "text", required: false, placeholder: "Full name" },
  { key: "aadhaarLast4", label: "Aadhaar (last 4 digits)", type: "tel", required: false, placeholder: "e.g. 1234" },
  { key: "pan", label: "PAN Number", type: "text", required: false, placeholder: "e.g. ABCDE1234F" },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    required: true,
    options: ["Male", "Female", "Other"],
  },
  {
    key: "qualification",
    label: "Highest Qualification",
    type: "select",
    required: true,
    options: ["10th Pass", "12th Pass", "Diploma", "Graduate", "Post Graduate"],
  },
  {
    key: "experience",
    label: "Work Experience",
    type: "select",
    required: false,
    options: ["Fresher", "1–2 years", "3–5 years", "5+ years"],
  },
  {
    key: "position",
    label: "Position Applied For",
    type: "select",
    required: false,
    options: ["Data Entry Operator", "Field Executive", "Support Associate", "Sales Executive", "Supervisor"],
  },
  {
    key: "cityPreference",
    label: "Preferred Work City",
    type: "select",
    required: false,
    options: ["Delhi", "Mumbai", "Bengaluru", "Hyderabad", "Pune", "Kolkata"],
  },
  { key: "monthlyIncome", label: "Monthly Income (₹)", type: "number", required: false, placeholder: "e.g. 25000" },
  { key: "accountNumber", label: "Bank Account Number", type: "tel", required: false, placeholder: "Account number" },
  { key: "ifsc", label: "IFSC Code", type: "text", required: false, placeholder: "e.g. SBIN0001234" },
  { key: "policyNumber", label: "Policy / Reference Number", type: "text", required: false, placeholder: "e.g. POL-123456" },
  { key: "orderId", label: "Order ID", type: "text", required: false, placeholder: "e.g. ORD-98765" },
  { key: "companyName", label: "Company / Firm Name", type: "text", required: false, placeholder: "Registered name" },
  { key: "gstNumber", label: "GST Number", type: "text", required: false, placeholder: "15-digit GSTIN" },
  { key: "referenceName", label: "Reference Person Name", type: "text", required: false, placeholder: "Full name" },
  { key: "referencePhone", label: "Reference Person Phone", type: "tel", required: false, placeholder: "10-digit number" },
  { key: "startDate", label: "Preferred Start Date", type: "date", required: false },
  { key: "amount", label: "Amount (₹)", type: "number", required: false, placeholder: "e.g. 50000" },
  { key: "remarks", label: "Remarks / Notes", type: "text", required: false, placeholder: "Any extra details" },
];

function pick(arr, i, salt) {
  return arr[(i * 7 + salt * 13) % arr.length];
}

function buildFields(seed) {
  // Every form starts with Full Name, then 4–7 fields from the bank
  const count = 5 + (seed % 4); // total 5–8 fields
  const picked = [];
  const usedKeys = new Set(["fullName"]);
  let offset = (seed * 3 + 1) % fieldsBank.length;

  while (picked.length < count - 1) {
    const field = fieldsBank[offset % fieldsBank.length];
    offset++;
    if (usedKeys.has(field.key)) continue;
    usedKeys.add(field.key);
    picked.push({ ...field });
  }

  return [
    {
      key: "fullName",
      label: "Full Name",
      type: "text",
      required: true,
      placeholder: "e.g. Ravi Kumar",
    },
    ...picked,
  ];
}

function buildFormTemplates(count = 500) {
  const templates = [];
  for (let i = 0; i < count; i++) {
    const ft = pick(formTypes, i, 1);
    const variant = Math.floor(i / formTypes.length) + 1;
    templates.push({
      id: `frm_${String(i + 1).padStart(3, "0")}`,
      title: `${ft.title} #${variant}`,
      description: ft.desc,
      fields: buildFields(i + 11),
    });
  }
  return templates;
}

module.exports = { buildFormTemplates };
