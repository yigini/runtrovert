import { registerRootComponent } from 'expo';

// Registers the background location task at module load time, before the app renders.
import './src/gps/engine';
import './src/tracking';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
