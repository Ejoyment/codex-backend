import { useState, useCallback } from 'react';
import { validate } from '../lib/security';
import { AlertCircle, CheckCircle } from 'lucide-react';

export function useFormValidation() {
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validateField = useCallback((name, value, rules) => {
    const result = validate(value, rules);
    setErrors(prev => {
      if (result.valid) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return { ...prev, [name]: result.errors[0] };
    });
    return result.valid;
  }, []);

  const touchField = useCallback((name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
  }, []);

  const validateAll = useCallback((fields) => {
    const newErrors = {};
    let valid = true;
    for (const [field, value, rules] of fields) {
      const result = validate(value, rules);
      if (!result.valid) {
        newErrors[field] = result.errors[0];
        valid = false;
      }
    }
    setErrors(newErrors);
    setTouched(Object.fromEntries(fields.map(([f]) => [f, true])));
    return valid;
  }, []);

  const clearErrors = useCallback(() => setErrors({}), []);
  const clearField = useCallback((name) => {
    setErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
  }, []);

  return { errors, touched, validateField, touchField, validateAll, clearErrors, clearField };
}

export function FormField({ name, label, error, touched, children }) {
  const showError = touched && error;
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      {children}
      {showError && (
        <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
          <AlertCircle size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export function SecureInput({ name, value, onChange, onBlur, error, touched, ...props }) {
  return (
    <input
      name={name}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      autoComplete={props.type === 'password' ? 'current-password' : 'off'}
      className={`form-input w-full px-3 py-2 rounded-lg bg-navy border ${
        touched && error ? 'border-red-500' : 'border-white/20'
      } text-white placeholder-gray-500 focus:outline-none focus:border-blue-500`}
      {...props}
    />
  );
}

export function SecurePasswordInput({ name, value, onChange, onBlur, error, touched, showStrength = false }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete="current-password"
          className={`form-input w-full px-3 py-2 pr-10 rounded-lg bg-navy border ${
            touched && error ? 'border-red-500' : 'border-white/20'
          } text-white placeholder-gray-500 focus:outline-none focus:border-blue-500`}
          placeholder="Enter password"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {touched && error && (
        <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
          <AlertCircle size={14} /> {error}
        </p>
      )}
    </div>
  );
}
