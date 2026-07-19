import unittest

from app.agents.specialist_prompts import SYSTEM_PROMPT_AGENT
from app.agents.supervisor.prompts import SYSTEM_PROMPT
from app.config.process_baseline import PROCESS_BASELINE, PROCESS_BASELINE_PATH, format_process_baseline
from app.context.builder import build_analysis_user_message
from app.context.schemas import ContextPackage
from app.safety.prompts import SYSTEM_PROMPT_SANDBOX


class ProcessBaselineContextTest(unittest.TestCase):
    def test_process_baseline_contains_machine_readable_thresholds(self) -> None:
        self.assertEqual(PROCESS_BASELINE_PATH.name, "process_baseline.json")
        self.assertTrue(PROCESS_BASELINE_PATH.exists())

        ro_tds = PROCESS_BASELINE["ro"]["entries"]["product_tds_range"]
        uf_tmp = PROCESS_BASELINE["uf"]["entries"]["tmp_attention_max"]

        self.assertEqual(ro_tds["min"], 100)
        self.assertEqual(ro_tds["max"], 300)
        self.assertEqual(ro_tds["unit"], "mg/L")
        self.assertEqual(uf_tmp["max"], 300)
        self.assertEqual(uf_tmp["unit"], "kPa")
        self.assertIs(ro_tds["requires_site_confirmation"], True)

    def test_format_process_baseline_filters_by_incident_type(self) -> None:
        text = format_process_baseline("dosing_abnormal")

        self.assertIn("阻垢剂投加量临时参考", text)
        self.assertIn("一级 RO 产水 TDS", text)
        self.assertIn("需现场确认", text)
        self.assertNotIn("泵组电流演示参考", text)

    def test_analysis_message_includes_structured_baseline_without_rag(self) -> None:
        message = build_analysis_user_message(
            ContextPackage(
                agent_id="ro",
                incident_type="ro_fouling",
                phase="agent",
                telemetry={"roTds": 360, "roPressureDiff": 0.78},
            )
        )

        self.assertIn("结构化运行基准", message)
        self.assertIn("一级 RO 产水 TDS：100-300 mg/L", message)
        self.assertNotIn("参考知识证据", message)


    def test_system_prompts_keep_agent_role_not_ppt_baseline(self) -> None:
        combined = "\n".join([SYSTEM_PROMPT, SYSTEM_PROMPT_AGENT, SYSTEM_PROMPT_SANDBOX])

        self.assertNotIn("PPT 工艺参数基准", combined)
        self.assertIn("结构化运行基准", combined)
        self.assertIn("不得编造", combined)


if __name__ == "__main__":
    unittest.main()
