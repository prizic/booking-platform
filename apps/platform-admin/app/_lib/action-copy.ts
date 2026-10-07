export const actionCopy = {
  assignPlan: {
    trigger: ["Change plan", "تغيير الخطة"],
    title: ["Change this tenant's plan", "تغيير خطة هذا المستأجر"],
    body: [
      "Features from the new plan are granted and features it lacks are removed. Manual overrides stay as they are.",
      "تُمنح ميزات الخطة الجديدة وتُزال الميزات غير المشمولة. تبقى التجاوزات اليدوية كما هي.",
    ],
    submit: ["Change plan", "تغيير الخطة"],
    done: ["Plan changed and features updated.", "تم تغيير الخطة وتحديث الميزات."],
  },
  updateSubscription: {
    trigger: ["Change status", "تغيير الحالة"],
    title: ["Change subscription status", "تغيير حالة الاشتراك"],
    body: [
      "Cancelling sets an end date on plan features; they stop working at that time.",
      "الإلغاء يضع تاريخ انتهاء لميزات الخطة؛ فتتوقف عند ذلك الوقت.",
    ],
    submit: ["Save status", "حفظ الحالة"],
    done: ["Subscription updated.", "تم تحديث الاشتراك."],
  },
  override: {
    trigger: ["Override a feature", "تجاوز ميزة"],
    title: ["Override a feature for this tenant", "تجاوز ميزة لهذا المستأجر"],
    body: [
      "An override wins over the plan until it expires or is cleared.",
      "يتغلّب التجاوز على الخطة حتى ينتهي أو يُلغى.",
    ],
    submit: ["Save override", "حفظ التجاوز"],
    done: ["Override saved.", "تم حفظ التجاوز."],
  },
  clearOverride: {
    trigger: ["Clear override", "إلغاء التجاوز"],
    title: ["Return this feature to the plan?", "إرجاع هذه الميزة إلى الخطة؟"],
    submit: ["Clear override", "إلغاء التجاوز"],
    done: ["Override cleared.", "تم إلغاء التجاوز."],
  },
  addDomain: {
    trigger: ["Add domain", "إضافة نطاق"],
    title: ["Add a domain", "إضافة نطاق"],
    body: [
      "The domain is added as pending and a verification job is queued. It serves traffic only after a worker verifies DNS.",
      "يُضاف النطاق كمعلّق وتُضاف مهمة تحقق. لا يخدم الزيارات إلا بعد أن يتحقق العامل من DNS.",
    ],
    submit: ["Add and queue verification", "إضافة وجدولة التحقق"],
    done: [
      "Domain added. Verification is queued.",
      "تمت إضافة النطاق. التحقق في قائمة الانتظار.",
    ],
  },
  verifyDomain: {
    submit: ["Queue verification", "جدولة التحقق"],
    done: [
      "Verification queued. Nothing is verified until the worker reports.",
      "تمت جدولة التحقق. لا يُعدّ موثّقًا حتى يُبلّغ العامل.",
    ],
  },
  requestSupport: {
    trigger: ["Request support access", "طلب وصول الدعم"],
    title: ["Request read-only support access", "طلب وصول دعم للقراءة فقط"],
    body: [
      "A second administrator must approve. Access is read-only, time-limited, shown to the tenant, and recorded.",
      "يجب أن يوافق مسؤول ثانٍ. الوصول للقراءة فقط ومحدود المدة ومعروض للمستأجر ومسجّل.",
    ],
    submit: ["Send request", "إرسال الطلب"],
    done: ["Request sent. It waits for approval.", "أُرسل الطلب. ينتظر الموافقة."],
  },
  fields: {
    plan: ["Plan", "الخطة"],
    ring: ["Rollout ring", "حلقة النشر"],
    state: ["Status", "الحالة"],
    endsAt: ["End date and time (UTC)", "تاريخ ووقت الانتهاء (بالتوقيت العالمي)"],
    feature: ["Feature key", "مفتاح الميزة"],
    grant: ["Override", "التجاوز"],
    grantYes: ["Grant the feature", "منح الميزة"],
    grantNo: ["Withhold the feature", "حجب الميزة"],
    expiresAt: ["Expires (UTC, optional)", "تنتهي (بالتوقيت العالمي، اختياري)"],
    hostname: ["Hostname", "اسم النطاق"],
    application: ["Application", "التطبيق"],
    instance: ["Instance", "النسخة"],
    ticket: ["Ticket reference", "مرجع التذكرة"],
    minutes: ["Requested duration (minutes)", "المدة المطلوبة (بالدقائق)"],
    minutesHint: [
      "Between 5 and 480. The approver sets the final duration.",
      "بين ٥ و٤٨٠. يحدد الموافِق المدة النهائية.",
    ],
  },
} as const;
