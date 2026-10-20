import {createRoot} from 'react-dom/client';
import {OperationsDashboard} from './OperationsDashboard';
import '../../src/control-states.css';
import './ops.css';

createRoot(document.getElementById('root')!).render(
  <OperationsDashboard />,
);
