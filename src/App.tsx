/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Dashboard from './components/Dashboard';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  return (
    <>
      <Dashboard />
      <Toaster position="top-right" />
    </>
  );
}
