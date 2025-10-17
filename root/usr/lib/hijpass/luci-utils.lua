require("luci.ip")

local params = { "iptype" }

function getIPFamily(ip)
	local result = nil

	result = luci.ip.checkip4(ip)
	if result then
		print(4)
		return 0
	end

	result = luci.ip.checkip6(ip)
	if result then
		print(6)
		return 0
	end

	return 1
end

function checkParams(val)
	for _, v in ipairs(params) do
		if v == val then
			return true
		end
	end
	return false
end


if not checkParams(arg[1]) then
  print("Invalid parameter")
  return 1
end

if arg[1] == "iptype" then
	return getIPFamily(arg[2])
end
