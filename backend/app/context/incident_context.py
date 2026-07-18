INCIDENT_CONTEXT = {
    "dosing_abnormal": "当前异常类型：加药系统异常（RO 阻垢剂投加偏差、UF 清洗药剂状态异常或加药泵流量偏差）",
    "uf_clogging": "当前异常类型：超滤膜污堵（UF TMP 升高、产水浊度或 SDI 异常、反洗恢复不足）",
    "ro_fouling": "当前异常类型：反渗透膜污染/结垢（一级 RO 产水 TDS 异常、段间压差升高、脱盐率下降或产水量下降）",
    "pump_overload": "当前异常类型：泵组运行异常（电流超标、温度升高、流量/压力无法满足 UF/RO 工艺负荷）",
}

__all__ = ["INCIDENT_CONTEXT"]
