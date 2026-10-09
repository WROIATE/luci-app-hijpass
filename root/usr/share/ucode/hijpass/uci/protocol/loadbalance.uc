import { BaseOptions } from './options.uc';

// loadbalance 的字段契约；不包含其它协议的专用字段。
export const fields = {
	...BaseOptions,
	url: ["text", ""], // 字符串，URL
	interval: ["duration", 0], // 时长字符串，解码后单位为秒，Interval
	tolerance: ["integer", 0, 65535], // 非负整数，Tolerance
	idle_timeout: ["duration", 0], // 时长字符串，解码后单位为秒，IdleTimeout
	interrupt_exist_connections: ["bool", false], // UCI 0/1 开关，InterruptConnections
	strategy: ["text", "leastLoad"], // 字符串，Strategy
	strategy_expected: ["integer", 1, 2147483647], // 非负整数，StrategyExpected
	strategy_max_rtt: ["duration", 1], // 时长字符串，解码后单位为秒，StrategyMaxRTT
	strategy_tolerance: ["number", 0.05], // 非负数值，StrategyTolerance
	fallback_tag: ["text", ""], // 字符串，Fallback
	probe_url: ["text", "https://connectivitycheck.gstatic.com/generate_204"], // 字符串，ProbeURL
	probe_connectivity: ["text", ""], // 字符串，ProbeConnectivity
	probe_interval: ["duration", 60], // 时长字符串，解码后单位为秒，ProbeInterval
	probe_timeout: ["duration", 2], // 时长字符串，解码后单位为秒，ProbeTimeout
	probe_sampling: ["integer", 3, 2147483647], // 非负整数，ProbeSampling
	probe_http_method: ["text", ""], // 字符串，ProbeMethod
};
