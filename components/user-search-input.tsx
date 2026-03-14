'use client';

interface UserSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
}

export function UserSearchInput({
  value,
  onChange,
  placeholder = 'Search by username...',
  minLength = 2,
  maxLength = 50,
  disabled = false,
  autoFocus = false,
  'aria-label': ariaLabel = 'Search users by username',
}: UserSearchInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v.length <= maxLength) onChange(v);
  };

  return (
    <input
      type="search"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      minLength={minLength}
      maxLength={maxLength}
      className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
    />
  );
}
