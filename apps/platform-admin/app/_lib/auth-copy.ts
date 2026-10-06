export const authCopy = {
  loginTitle: ["Sign in to Platform Admin", "تسجيل الدخول إلى إدارة المنصة"],
  email: ["Email", "البريد الإلكتروني"],
  password: ["Password", "كلمة المرور"],
  signIn: ["Sign in", "تسجيل الدخول"],
  signingIn: ["Signing in…", "جارٍ تسجيل الدخول…"],
  mfaTitle: ["Enter your authenticator code", "أدخل رمز تطبيق المصادقة"],
  code: ["6-digit code", "رمز من ٦ أرقام"],
  verify: ["Verify", "تحقق"],
  verifying: ["Verifying…", "جارٍ التحقق…"],
  errorTitle: ["Sign-in did not complete", "لم يكتمل تسجيل الدخول"],
  invalidCredentials: [
    "The email or password is not correct.",
    "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  ],
  invalidCode: [
    "That code was not accepted. Wait for a new code and try again.",
    "لم يُقبل هذا الرمز. انتظر رمزًا جديدًا وحاول مرة أخرى.",
  ],
  noFactor: [
    "This account has no verified authenticator. Set one up first.",
    "لا يوجد تطبيق مصادقة موثّق لهذا الحساب. أعدّه أولًا.",
  ],
  unavailable: [
    "The sign-in service did not answer. Try again.",
    "لم تستجب خدمة تسجيل الدخول. حاول مرة أخرى.",
  ],
  enrollTitle: ["Set up your authenticator app", "إعداد تطبيق المصادقة"],
  enrollBody: [
    "Platform Admin requires a second factor. Scan the QR code or enter the setup key in an authenticator app, then enter the 6-digit code it shows.",
    "تتطلب إدارة المنصة عاملًا ثانيًا. امسح رمز QR أو أدخل مفتاح الإعداد في تطبيق مصادقة، ثم أدخل الرمز المكوّن من ٦ أرقام.",
  ],
  enrollQr: ["QR code for your authenticator app", "رمز QR لتطبيق المصادقة"],
  enrollKey: ["Setup key", "مفتاح الإعداد"],
  enrollSubmit: ["Verify and enable", "تحقق وفعّل"],
  enrollFailed: [
    "The authenticator could not be set up. Reload to try again.",
    "تعذّر إعداد تطبيق المصادقة. أعد التحميل للمحاولة مجددًا.",
  ],
  preparing: ["Preparing a new setup key…", "جارٍ تجهيز مفتاح إعداد جديد…"],
  notFoundTitle: ["Page not found", "الصفحة غير موجودة"],
  notFoundBody: [
    "The address may be mistyped, or the record was removed.",
    "قد يكون العنوان خاطئًا، أو أُزيل السجل.",
  ],
  returnHome: ["Go to the overview", "الانتقال إلى النظرة العامة"],
} as const satisfies Record<string, readonly [string, string]>;
