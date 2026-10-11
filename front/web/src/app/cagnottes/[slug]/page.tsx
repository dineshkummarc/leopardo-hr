import type { Metadata } from 'next';
import CagnotteClient from './CagnotteClient';
import { resolveApiBaseUrl } from '@/lib/api-client';

/**
 * FUND-100 (#8402) — Page publique d'une cagnotte solidaire (`/cagnottes/{slug}`).
 *
 * Composant serveur : métadonnées Open Graph de partage (titre, description,
 * visuel de couverture le cas échéant) résolues depuis l'API publique —
 * c'est ce qui rend le lien de collecte présentable quand il est partagé
 * (WhatsApp, réseaux, messageries). Le rendu interactif (don, polling,
 * mur des soutiens, QR) vit dans `CagnotteClient`.
 */

type PublicFundraiserForMetadata = {
  title: string;
  description: string | null;
  beneficiary_name: string | null;
  cover_image_path: string | null;
};

async function fetchFundraiserForMetadata(slug: string): Promise<PublicFundraiserForMetadata | null> {
  try {
    const response = await fetch(
      `${resolveApiBaseUrl()}/public/fundraisers/${encodeURIComponent(slug)}`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { data: PublicFundraiserForMetadata };
    return payload.data ?? null;
  } catch {
    return null; // métadonnées génériques — la page client gère le 404
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const fundraiser = await fetchFundraiserForMetadata(slug);

  if (!fundraiser) {
    return {
      title: 'Cagnotte solidaire — Leopardo',
      description: 'Soutenez une cause en quelques secondes : don par carte bancaire ou mobile money.',
    };
  }

  const description = fundraiser.description
    ?? `Soutenez ${fundraiser.beneficiary_name ?? 'cette cause'} en quelques secondes : don par carte bancaire ou mobile money.`;

  return {
    title: `${fundraiser.title} — Cagnotte solidaire`,
    description,
    openGraph: {
      title: fundraiser.title,
      description,
      type: 'website',
      images: fundraiser.cover_image_path ? [fundraiser.cover_image_path] : undefined,
    },
  };
}

export default async function CagnottePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CagnotteClient slug={slug} />;
}
