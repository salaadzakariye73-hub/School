export function SchoolCrest({
  className = 'w-8 h-8',
  logoUrl,
}: {
  className?: string;
  logoUrl?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="School Logo"
        className={`${className} rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="8" fill="#0F294A" />
      <path
        d="M20 7L31 11.5V20.5C31 26.8 26.2 31.9 20 33.5C13.8 31.9 9 26.8 9 20.5V11.5L20 7Z"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 16.5C16.2 15.6 18.2 15.6 20 16.6C21.8 15.6 23.8 15.6 25.5 16.5V25C23.8 24.1 21.8 24.1 20 25.1C18.2 24.1 16.2 24.1 14.5 25V16.5Z"
        stroke="#93C5FD"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M20 16.6V25.1" stroke="#93C5FD" strokeWidth="1.6" />
    </svg>
  );
}
