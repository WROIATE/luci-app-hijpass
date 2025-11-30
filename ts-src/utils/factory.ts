import {ShuntConfigUtils} from "../module/luci";
import {SingBoxUtils} from "./singbox";
import {XrayUtils} from "./xray";

export const FactoryUtils = {
    getShuntUtils: function (type: string): ShuntConfigUtils {
        switch (type) {
            case "sing-box":
                return SingBoxUtils
            case "xray":
                return XrayUtils
        }
    }
}