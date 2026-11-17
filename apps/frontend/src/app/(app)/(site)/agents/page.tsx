import { brandNameServerSide } from '@gitroom/helpers/utils/brand';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: `${brandNameServerSide()} - Agent`,
  description: '',
};

export default async function Page() {
  return redirect('/agents/new');
}
