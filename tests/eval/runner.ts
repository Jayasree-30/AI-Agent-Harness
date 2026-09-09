import { InMemoryRetrieval, AnthropicProvider } from "../../src/index.js";
import { GOLDEN_CASES, INJECTION_CASES, SCOPE_CASES, ALL_CASES, runEval, printReport } from "./corpus";

const DOCUMENTS = [
	{ id: "company-policies", title: "Company Policy Handbook", content: "Full-time employees accrue 20 vacation days per year. Up to 5 unused days carry over. Sick leave: 10 paid days per year. Paid parental leave: 12 weeks. Observed holidays: Christmas, Thanksgiving, New Year, Independence Day, Labor Day, Memorial Day. Holidays falling on weekends roll to nearest weekday. Remote work: 3 days per week. Meal reimbursement during travel: $75/day. Harassment reports go to hotline or conduct@company.com. Passwords: minimum 12 characters, rotate every 90 days. Performance reviews: semi-annually in June and December. Two-factor authentication is mandatory on all systems." },
	{ id: "engineering-guide", title: "Engineering Onboarding Guide", content: "Setup: clone repo, install deps, run tests. Code review: 2 approvals required. Deploy: CI/CD pipeline. Stack: TypeScript, Node.js. Branching: feature branches off main. PRs require passing CI." },
];

async function main() {
	const args = process.argv.slice(2);
	const filter = args.find((a) => !a.startsWith("-"));

	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		console.error("ERROR: ANTHROPIC_API_KEY is not set");
		console.error("Run with: ANTHROPIC_API_KEY=sk-ant-... pnpm eval");
		process.exit(1);
	}

	const baseURL = process.env.ANTHROPIC_BASE_URL;
	const { Anthropic } = await import("@anthropic-ai/sdk");
	const client = new Anthropic({
		apiKey,
		baseURL: baseURL ?? "https://api.anthropic.com",
	});

	const llm = new AnthropicProvider(client);
	const retrieval = new InMemoryRetrieval();
	const documents = DOCUMENTS;

	let cases = ALL_CASES;
	if (filter === "golden") cases = GOLDEN_CASES;
	else if (filter === "injection") cases = INJECTION_CASES;
	else if (filter === "scope") cases = SCOPE_CASES;

	console.log(`\nRunning eval: ${cases.length} cases (${filter ?? "all"})...`);
	const report = await runEval(llm, retrieval, documents, cases);
	printReport(report);

	const threshold = 0.8;
	if (report.passRate < threshold) {
		console.error(`\nFAIL: Pass rate ${(report.passRate * 100).toFixed(1)}% < ${(threshold * 100).toFixed(0)}%`);
		process.exit(1);
	}

	console.log(`\nPASS: ${report.passed}/${report.total} (${(report.passRate * 100).toFixed(1)}%)`);
	process.exit(0);
}

main().catch((err) => {
	console.error("Eval runner crashed:", err);
	process.exit(1);
});
