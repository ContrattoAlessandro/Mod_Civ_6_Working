-- CityScanner.lua
-- Scans city surroundings and prints for Python use with Cubic Coordinates.

function OffsetToCubic(x, y)
    local q = x - (y + (y % 2)) / 2
    local r = y
    return q, r, -q - r
end

function OnCitySelectionChanged(playerID, cityID, i, j, k, isSelected, isKeySelection)
    if not isSelected then return end

    local pPlayer = Players[playerID];
    local pCity = pPlayer:GetCities():FindID(cityID);
    if not pCity then return end

    local centerX = pCity:GetX();
    local centerY = pCity:GetY();
    local radius = 4;

    local cq, cr, cs = OffsetToCubic(centerX, centerY);

    print("--- START CITY DATA SCAN ---");
    print("City: " .. pCity:GetName());
    print(string.format("CenterCubic: q=%d, r=%d, s=%d", cq, cr, cs));

    for i = 0, Map.GetPlotCount() - 1 do
        local pPlot = Map.GetPlotByIndex(i);
        local dx, dy = pPlot:GetX(), pPlot:GetY();
        local distance = Map.GetPlotDistance(centerX, centerY, dx, dy);

        if distance <= radius then
            local pq, pr, ps = OffsetToCubic(dx, dy);
            -- Relative cubic coordinates
            local relQ = pq - cq;
            local relR = pr - cr;
            local relS = ps - cs;

            local terrainType = pPlot:GetTerrainType() ~= -1 and GameInfo.Terrains[pPlot:GetTerrainType()].TerrainType or
            "NONE";
            local featureType = pPlot:GetFeatureType() ~= -1 and GameInfo.Features[pPlot:GetFeatureType()].FeatureType or
            "NONE";
            local resourceType = pPlot:GetResourceType() ~= -1 and
            GameInfo.Resources[pPlot:GetResourceType()].ResourceType or "NONE";

            local plotStr = string.format("{'q': %d, 'r': %d, 's': %d, 't': '%s', 'f': '%s', 'res': '%s', 'riv': %s}",
                relQ, relR, relS, terrainType, featureType, resourceType, tostring(pPlot:IsRiver()));
            print(plotStr);
        end
    end
    print("--- END CITY DATA SCAN ---");
end

Events.CitySelectionChanged.Add(OnCitySelectionChanged);
print("City Scanner Ready - Coordinates synced with Python Simulator.");
