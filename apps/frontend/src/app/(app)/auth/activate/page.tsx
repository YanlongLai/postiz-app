export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { Activate } from '@gitroom/frontend/components/auth/activate';
import { brandNameServerSide } from '@gitroom/helpers/utils/brand';
export const metadata: Metadata = {
  title: `${brandNameServerSide()} - Activate your account`,
  description: '',
};
export default async function Auth() {
  return <Activate />;
}
