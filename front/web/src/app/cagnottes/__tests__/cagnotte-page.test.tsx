import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api-client';
import CagnotteClient from '../[slug]/CagnotteClient';

jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr'),
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    clone: () => jsonResponse(payload, status),
  } as unknown as Response;
}

const fundraiser = {
  data: {
    slug: 'aide-fatou',
    title: 'Aide pour Fatou',
    description: 'Frais médicaux urgents',
    beneficiary_name: 'Fatou Diallo',
    category: 'health',
    category_label: 'Santé',
    goal_amount: 500000,
    collected_amount: 125000,
    progress_percent: 25,
    contributions_count: 7,
    currency: 'XOF',
    suggested_amounts: [1000, 5000, 10000],
    min_amount: 100,
    max_amount: 1000000,
    cover_image_path: null,
    status: 'active',
    accepts_contributions: true,
    ends_at: null,
    published_at: '2026-10-10T10:00:00+00:00',
    public_path: '/cagnottes/aide-fatou',
    enabled_methods: ['card', 'mobile_money'],
    allow_anonymous: true,
    allow_messages: true,
    show_supporters: true,
  },
};

const supporters = {
  data: [
    { name: 'Awa', amount: 5000, currency: 'XOF', message: 'Courage !', paid_at: '2026-10-10T12:00:00+00:00' },
    { name: 'Anonyme', amount: null, currency: null, message: null, paid_at: '2026-10-10T13:00:00+00:00' },
  ],
};

beforeAll(() => {
  window.localStorage.setItem('preferred_locale', 'fr');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Page publique cagnotte (FUND-100)', () => {
  it('affiche la cagnotte, le mur des soutiens et initie un don mobile money', async () => {
    mockedApiFetch
      .mockResolvedValueOnce(jsonResponse(fundraiser))
      .mockResolvedValueOnce(jsonResponse(supporters))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          reference: 'FC-TEST1234',
          amount: 5000,
          currency: 'XOF',
          payment_method: 'mobile_money',
          status: 'pending',
          payment: {
            provider_reference: 'SBX-1',
            redirect_url: null,
            ussd_code: '#144*1*1#',
            instructions: 'Composez le code pour valider.',
            status: 'pending',
          },
          status_url: '/api/v1/public/contributions/FC-TEST1234',
        },
      }, 201));

    render(<CagnotteClient slug="aide-fatou" />);

    // Cagnotte chargée
    expect(await screen.findByText('Aide pour Fatou')).toBeInTheDocument();
    expect(screen.getByText('Fatou Diallo')).toBeInTheDocument();

    // Mur des soutiens
    expect(await screen.findByText('Awa')).toBeInTheDocument();
    expect(screen.getByText('Courage !')).toBeInTheDocument();

    // Choix du montant suggéré 5 000 puis méthode mobile money
    await userEvent.click(screen.getByRole('button', { name: /5[\s\u202f]?000|5[,.]?000/ }));
    await userEvent.click(screen.getByRole('button', { name: /Mobile money/ }));
    await userEvent.type(screen.getByPlaceholderText(/Numéro mobile money/), '+221770000000');

    await userEvent.click(screen.getByRole('button', { name: /Donner/ }));

    // Écran d'attente avec code USSD
    expect(await screen.findByText('#144*1*1#')).toBeInTheDocument();

    // Vérification du POST
    const contributeCall = mockedApiFetch.mock.calls.find(([endpoint]) => String(endpoint).includes('/contribute'));
    expect(contributeCall).toBeDefined();
    const body = JSON.parse(String((contributeCall?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      amount: 5000,
      payment_method: 'mobile_money',
      contributor_phone: '+221770000000',
      website: '',
    });
  });

  it('affiche un état introuvable pour un slug inconnu', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('404'));

    render(<CagnotteClient slug="inconnu" />);

    expect(await screen.findByText('Cagnotte introuvable')).toBeInTheDocument();
  });

  it('masque le mur des soutiens quand le paramétrage tenant le désactive', async () => {
    const withoutWall = {
      data: { ...fundraiser.data, show_supporters: false },
    };
    mockedApiFetch.mockResolvedValueOnce(jsonResponse(withoutWall));

    render(<CagnotteClient slug="aide-fatou" />);

    expect(await screen.findByText('Aide pour Fatou')).toBeInTheDocument();
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Ils soutiennent')).not.toBeInTheDocument();
  });

  it('informe quand la cagnotte n\'accepte plus de contributions', async () => {
    const closed = {
      data: { ...fundraiser.data, accepts_contributions: false, status: 'closed' },
    };
    mockedApiFetch.mockResolvedValueOnce(jsonResponse(closed));
    mockedApiFetch.mockResolvedValueOnce(jsonResponse(supporters));

    render(<CagnotteClient slug="aide-fatou" />);

    expect(await screen.findByText(/n'accepte plus de contributions/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Donner/ })).not.toBeInTheDocument();
  });
});
