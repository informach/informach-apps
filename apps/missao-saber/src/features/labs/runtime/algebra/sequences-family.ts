import { advancedSequencesTool } from "./advanced-sequences";
import { combineTools } from "./combine-tools";
import { sequencesTool } from "./sequences";
export const sequencesFamilyTool = combineTools(sequencesTool, advancedSequencesTool);
