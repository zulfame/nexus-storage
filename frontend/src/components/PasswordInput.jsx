import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({ value, onChange, placeholder = "••••••••", testid, onKeyDown, autoComplete = "new-password" }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        data-testid={testid}
        className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 pr-11 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        data-testid={testid ? `${testid}-toggle` : undefined}
        aria-label={show ? "Hide value" : "Show value"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
