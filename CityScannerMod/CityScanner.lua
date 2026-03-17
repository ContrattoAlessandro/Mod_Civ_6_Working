-- CityScanner.lua
-- Scans city surroundings and prints for Python use with Cubic Coordinates.

function OffsetToCubic(x, y)
    local q = x - (y - (y % 2)) / 2
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

            -- NUOVO: Conta su quanti lati scorre il fiume calcolando i vicini in coordinate cubiche
            local riverEdges = 0;
            local cubicDirections = {
                { 1,  0, -1 }, { 1, -1, 0 }, { 0, -1, 1 },
                { -1, 0, 1 }, { -1, 1, 0 }, { 0, 1, -1 }
            };

            for _, dir in ipairs(cubicDirections) do
                -- Coordinate cubiche della cella adiacente
                local adjQ = pq + dir[1];
                local adjR = pr + dir[2];

                -- Formula inversa: da Cubiche a Offset (X, Y) per trovare l'indice nella mappa
                local adjX = adjQ + math.floor((adjR - (adjR % 2)) / 2);
                local adjY = adjR;

                -- Otteniamo l'oggetto "plot" adiacente usando le sue coordinate reali
                local pAdj = Map.GetPlot(adjX, adjY);

                -- Se la cella adiacente esiste, controlliamo se il fiume passa sul bordo in mezzo a loro
                if pAdj and pPlot:IsRiverCrossingToPlot(pAdj) then
                    riverEdges = riverEdges + 1;
                end
            end

            -- MODIFICATO: Aggiunto 'rivEdges' all'output JSON
            local plotStr = string.format(
                "{'q': %d, 'r': %d, 's': %d, 't': '%s', 'f': '%s', 'res': '%s', 'riv': %s, 'rivEdges': %d}",
                relQ, relR, relS, terrainType, featureType, resourceType, tostring(pPlot:IsRiver()), riverEdges);
            print(plotStr);
        end
    end
    print("--- END CITY DATA SCAN ---");
end

Events.CitySelectionChanged.Add(OnCitySelectionChanged);
print("City Scanner Ready - Coordinates synced with Python Simulator.");
