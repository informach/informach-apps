import type { ToolLaunch, ToolModule } from "../types";
export function combineTools(base: ToolModule, ...extensions: ToolModule[]): ToolModule {
  const modules = [base, ...extensions],
    modes = modules.flatMap((module) => [...module.modes]);
  if (
    modules.some((module) => module.family !== base.family) ||
    new Set(modes).size !== modes.length
  )
    throw new Error("Extensões algébricas têm famílias ou modos incompatíveis.");
  const select = (launch: ToolLaunch) => {
    const module = modules.find(
      (candidate) => candidate.family === launch.family && candidate.modes.includes(launch.mode),
    );
    if (!module) throw new Error("Experiência algébrica desconhecida.");
    return module;
  };
  return {
    family: base.family,
    modes,
    activity: (launch) => select(launch).activity(launch),
    parse: (launch, raw) => select(launch).parse(launch, raw),
    assess: (launch, state, answer) => select(launch).assess(launch, state, answer),
    summarize: (launch, state) => select(launch).summarize(launch, state),
  };
}
