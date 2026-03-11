import { notFound } from 'next/navigation';
import { E2ERecentAlbumsClient } from './recent-albums-client';

export default function E2ERecentAlbumsPage() {
  if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();

  return <E2ERecentAlbumsClient />;
}

