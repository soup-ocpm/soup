import { OceanStudio } from './studio';
import { OceanClassGraph } from './class-graph';

if (!customElements.get('soup-ocean-studio')) customElements.define('soup-ocean-studio', OceanStudio);
if (!customElements.get('soup-ocean-class-graph')) customElements.define('soup-ocean-class-graph', OceanClassGraph);
