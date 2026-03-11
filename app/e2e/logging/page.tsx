import { notFound } from 'next/navigation';
import { E2ELoggingClient } from './logging-client';

export default function E2ELoggingPage() {
  if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();

  return <E2ELoggingClient />;
}

