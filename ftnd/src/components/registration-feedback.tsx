'use client';

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';

type Notice = { message: string; email: string } | null;
const Context = createContext<{
  notice: Notice;
  setNotice: Dispatch<SetStateAction<Notice>>;
} | null>(null);

export function RegistrationFeedback({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<Notice>(null);
  return <Context.Provider value={{ notice, setNotice }}>{children}</Context.Provider>;
}

export function useRegistrationFeedback() {
  const context = useContext(Context);
  if (!context) throw new Error('RegistrationFeedback is required');
  return context;
}
