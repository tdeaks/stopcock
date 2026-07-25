// Generates the compiler's data-only semantic/lowering projection without
// importing @stopcock/fp runtime modules, generated wrappers, or registries.
import {
  formatGeneratedProtocolTypeScriptV1,
  writeCompilerOpsTableV1,
} from '../../fp/codegen/protocol/generate-protocol'

writeCompilerOpsTableV1()
formatGeneratedProtocolTypeScriptV1(['packages/fp-compiler/src/ops-table.ts'])
console.log('fp-compiler: generated semantic operation snapshot')
