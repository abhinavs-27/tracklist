import { notFound } from 'next/navigation';
import { E2ESocialClient } from './social-client';

export default function E2ESocialPage() {
  if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();

  return <E2ESocialClient />;
}

